import { createApi, type BaseQueryFn } from "@reduxjs/toolkit/query/react";
import type {
  ApiEnvelope,
  User,
  ConversationSummary,
  ChatMessage,
  Report,
  ReportPage,
  ReportFilters,
} from "@/lib/types";
import { axiosBaseQuery, type AxiosQueryArgs, type AxiosQueryError } from "./axiosBaseQuery";
import { clearUser, setUser } from "./authSlice";

// ─── The app's single HTTP client (RTK Query over axios) ──
//
// Transport is axios (withCredentials sends the httpOnly auth cookies — no JWT
// ever touches JS). On a 401 for a protected route, we rotate the session via
// /auth/refresh once and retry; if that fails, the user is cleared (CLAUDE.md §2).

const rawBaseQuery = axiosBaseQuery();

// Single-flight guard: concurrent 401s share ONE refresh so they don't race the
// rotating refresh token (a second refresh would invalidate the first).
let refreshPromise: ReturnType<typeof rawBaseQuery> | null = null;

const baseQueryWithReauth: BaseQueryFn<AxiosQueryArgs | string, unknown, AxiosQueryError> = async (
  queryArgs,
  baseQueryApi,
  extraOptions,
) => {
  let result = await rawBaseQuery(queryArgs, baseQueryApi, extraOptions);

  const requestUrl = typeof queryArgs === "string" ? queryArgs : queryArgs.url;
  const isAuthRoute = requestUrl.startsWith("/auth/"); // don't reauth login/refresh failures

  if (result.error?.status === 401 && !isAuthRoute) {
    if (!refreshPromise) {
      refreshPromise = rawBaseQuery(
        { url: "/auth/refresh", method: "POST" },
        baseQueryApi,
        extraOptions,
      );
    }
    const refreshResult = await refreshPromise;
    refreshPromise = null;

    if (refreshResult.data) {
      result = await rawBaseQuery(queryArgs, baseQueryApi, extraOptions); // retry original
    } else {
      baseQueryApi.dispatch(clearUser());
    }
  }

  return result;
};

export const api = createApi({
  reducerPath: "api",
  baseQuery: baseQueryWithReauth,
  tagTypes: ["User", "Conversation", "Notification", "Report", "IngestionJob"],
  endpoints: (builder) => ({
    // ── Session ──
    me: builder.query<User, void>({
      query: () => "/auth/me",
      transformResponse: (response: ApiEnvelope<{ user: User }>) => response.data.user,
      providesTags: [{ type: "User", id: "ME" }],
    }),
    health: builder.query<{ status: string; db: string }, void>({
      query: () => "/health",
    }),

    // ── Auth ──
    login: builder.mutation<User, { email: string; password: string }>({
      query: (body) => ({ url: "/auth/login", method: "POST", body }),
      transformResponse: (response: ApiEnvelope<{ user: User }>) => response.data.user,
      // Set auth state the instant login resolves (don't wait on the /auth/me
      // refetch), so routing straight to /chat renders the signed-in UI with no flicker.
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          dispatch(setUser(data));
        } catch {
          // Login failed — the page shows the error toast; nothing to set here.
        }
      },
      invalidatesTags: [{ type: "User", id: "ME" }],
    }),
    register: builder.mutation<
      { user: User; needsVerification: boolean },
      { email: string; password: string; displayName: string }
    >({
      query: (body) => ({ url: "/auth/register", method: "POST", body }),
      transformResponse: (response: ApiEnvelope<{ user: User; needsVerification: boolean }>) =>
        response.data,
    }),
    verifyEmail: builder.mutation<User, { email: string; code: string }>({
      query: (body) => ({ url: "/auth/verify-email", method: "POST", body }),
      transformResponse: (response: ApiEnvelope<{ user: User }>) => response.data.user,
      // Verifying the code also signs the user in — set auth state immediately.
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          dispatch(setUser(data));
        } catch {
          // Verification failed — the page shows the error toast.
        }
      },
      invalidatesTags: [{ type: "User", id: "ME" }],
    }),
    resendVerification: builder.mutation<{ message: string }, { email: string }>({
      query: (body) => ({ url: "/auth/resend-verification", method: "POST", body }),
    }),
    forgotPassword: builder.mutation<{ message: string }, { email: string }>({
      query: (body) => ({ url: "/auth/forgot-password", method: "POST", body }),
    }),
    resetPassword: builder.mutation<
      { message: string },
      { email: string; code: string; newPassword: string }
    >({
      query: (body) => ({ url: "/auth/reset-password", method: "POST", body }),
    }),
    logout: builder.mutation<{ message: string }, void>({
      query: () => ({ url: "/auth/logout", method: "POST" }),
      invalidatesTags: [{ type: "User", id: "ME" }],
    }),

    // ── Conversations ──
    listConversations: builder.query<
      ConversationSummary[],
      { search?: string; archived?: boolean } | void
    >({
      query: (args) => ({
        url: "/conversations",
        params: {
          ...(args && args.search ? { search: args.search } : {}),
          ...(args && args.archived ? { archived: true } : {}),
        },
      }),
      transformResponse: (response: ApiEnvelope<{ conversations: ConversationSummary[] }>) =>
        response.data.conversations,
      // Per-id tags so a single-conversation change only refetches what it must.
      providesTags: (conversations) =>
        conversations
          ? [
              ...conversations.map((conversation) => ({
                type: "Conversation" as const,
                id: conversation.id,
              })),
              { type: "Conversation" as const, id: "LIST" },
            ]
          : [{ type: "Conversation" as const, id: "LIST" }],
    }),
    getConversation: builder.query<
      { conversation: ConversationSummary; messages: ChatMessage[] },
      string
    >({
      query: (conversationId) => `/conversations/${conversationId}`,
      transformResponse: (
        response: ApiEnvelope<{ conversation: ConversationSummary; messages: ChatMessage[] }>,
      ) => response.data,
      providesTags: (_result, _error, conversationId) => [
        { type: "Conversation", id: conversationId },
      ],
    }),
    updateConversation: builder.mutation<
      unknown,
      { id: string; title?: string; pinned?: boolean; archived?: boolean }
    >({
      query: ({ id, ...body }) => ({ url: `/conversations/${id}`, method: "PATCH", body }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: "Conversation", id },
        { type: "Conversation", id: "LIST" },
      ],
    }),
    deleteConversation: builder.mutation<unknown, string>({
      query: (conversationId) => ({ url: `/conversations/${conversationId}`, method: "DELETE" }),
      invalidatesTags: [{ type: "Conversation", id: "LIST" }],
    }),

    // ── Reports ──
    getReport: builder.query<Report, string>({
      query: (reportId) => `/reports/${reportId}`,
      transformResponse: (response: ApiEnvelope<{ report: Report }>) => response.data.report,
      providesTags: (_result, _error, reportId) => [{ type: "Report", id: reportId }],
    }),
    listReports: builder.query<ReportPage, ReportFilters | void>({
      query: (filters) => ({
        url: "/reports",
        params: {
          ...(filters?.category ? { category: filters.category } : {}),
          ...(filters?.severity ? { severity: filters.severity } : {}),
          ...(filters?.from ? { from: filters.from } : {}),
          ...(filters?.to ? { to: filters.to } : {}),
          ...(filters?.page ? { page: filters.page } : {}),
        },
      }),
      transformResponse: (response: ApiEnvelope<ReportPage>) => response.data,
      providesTags: [{ type: "Report", id: "LIST" }],
    }),

    // ── Profile ──
    updateProfile: builder.mutation<User, { displayName: string }>({
      query: (body) => ({ url: "/users/me", method: "PATCH", body }),
      transformResponse: (response: ApiEnvelope<{ user: User }>) => response.data.user,
      invalidatesTags: [{ type: "User", id: "ME" }],
    }),
    uploadAvatar: builder.mutation<User, FormData>({
      query: (formData) => ({ url: "/users/me/avatar", method: "PUT", body: formData }),
      transformResponse: (response: ApiEnvelope<{ user: User }>) => response.data.user,
      invalidatesTags: [{ type: "User", id: "ME" }],
    }),
    deleteAvatar: builder.mutation<User, void>({
      query: () => ({ url: "/users/me/avatar", method: "DELETE" }),
      transformResponse: (response: ApiEnvelope<{ user: User }>) => response.data.user,
      invalidatesTags: [{ type: "User", id: "ME" }],
    }),
  }),
});

export const {
  useMeQuery,
  useHealthQuery,
  useLoginMutation,
  useRegisterMutation,
  useVerifyEmailMutation,
  useResendVerificationMutation,
  useForgotPasswordMutation,
  useResetPasswordMutation,
  useLogoutMutation,
  useListConversationsQuery,
  useGetConversationQuery,
  useLazyGetConversationQuery,
  useUpdateConversationMutation,
  useDeleteConversationMutation,
  useGetReportQuery,
  useListReportsQuery,
  useUpdateProfileMutation,
  useUploadAvatarMutation,
  useDeleteAvatarMutation,
} = api;
