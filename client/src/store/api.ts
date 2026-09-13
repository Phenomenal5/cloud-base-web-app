import { createApi, type BaseQueryFn } from "@reduxjs/toolkit/query/react";
import type {
  ApiEnvelope,
  User,
  ConversationSummary,
  ChatMessage,
  Report,
  ReportPage,
  ReportFilters,
  NotificationFeed,
  UsageInfo,
} from "@/lib/types";
import { axiosBaseQuery, type AxiosQueryArgs, type AxiosQueryError } from "./axiosBaseQuery";
import { clearUser, setUser } from "./authSlice";

// the app's only HTTP client. on a 401 we rotate the session through
// /auth/refresh once and retry the original request. if that fails too, clear
// the user and treat them as a guest

const rawBaseQuery = axiosBaseQuery();

// all the 401s share one refresh promise. the refresh token rotates, so two of
// them running at once means the second one invalidates the first
let refreshPromise: ReturnType<typeof rawBaseQuery> | null = null;

const baseQueryWithReauth: BaseQueryFn<AxiosQueryArgs | string, unknown, AxiosQueryError> = async (
  queryArgs,
  baseQueryApi,
  extraOptions,
) => {
  let result = await rawBaseQuery(queryArgs, baseQueryApi, extraOptions);

  const requestUrl = typeof queryArgs === "string" ? queryArgs : queryArgs.url;
  // a failed login or a failed refresh must not kick off another refresh
  const isAuthRoute = requestUrl.startsWith("/auth/");

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
      result = await rawBaseQuery(queryArgs, baseQueryApi, extraOptions);
    } else {
      baseQueryApi.dispatch(clearUser());
    }
  }

  return result;
};

export const api = createApi({
  reducerPath: "api",
  baseQuery: baseQueryWithReauth,
  tagTypes: ["User", "Conversation", "Notification", "Report", "IngestionJob", "Usage"],
  endpoints: (builder) => ({
    // ===== session =====
    me: builder.query<User, void>({
      query: () => "/auth/me",
      transformResponse: (response: ApiEnvelope<{ user: User }>) => response.data.user,
      providesTags: [{ type: "User", id: "ME" }],
    }),
    health: builder.query<{ status: string; db: string }, void>({
      query: () => "/health",
    }),

    // ===== auth =====
    login: builder.mutation<User, { email: string; password: string }>({
      query: (body) => ({ url: "/auth/login", method: "POST", body }),
      transformResponse: (response: ApiEnvelope<{ user: User }>) => response.data.user,
      // set the user the moment login resolves instead of waiting for /auth/me to
      // come back. otherwise routing to /chat flashes the guest UI first
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          dispatch(setUser(data));
        } catch {
          // the page raises the toast, nothing to set here
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
      // entering the code logs them in as well, so set the user here too
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          dispatch(setUser(data));
        } catch {
          // page handles the toast
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

    // ===== usage =====
    // just seeds the dial on page load. after that the answer stream keeps it up
    // to date, see updateUsage in the chat page, so this never needs polling
    getUsage: builder.query<UsageInfo, void>({
      query: () => "/ask/usage",
      transformResponse: (response: ApiEnvelope<{ usage: UsageInfo }>) => response.data.usage,
      providesTags: [{ type: "Usage", id: "ME" }],
    }),

    // ===== conversations =====
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
      // a tag per id, so renaming one thread doesn't refetch every list we hold
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

    // ===== reports =====
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

    // ===== notifications =====
    // only an admin broadcast ever creates these, so everything here is just
    // marking things read
    listNotifications: builder.query<NotificationFeed, void>({
      query: () => "/notifications",
      transformResponse: (response: ApiEnvelope<NotificationFeed>) => response.data,
      providesTags: (feed) =>
        feed
          ? [
              ...feed.notifications.map((notification) => ({
                type: "Notification" as const,
                id: notification.id,
              })),
              { type: "Notification" as const, id: "LIST" },
            ]
          : [{ type: "Notification" as const, id: "LIST" }],
    }),
    markNotificationRead: builder.mutation<unknown, string>({
      query: (notificationId) => ({
        url: `/notifications/${notificationId}/read`,
        method: "PATCH",
      }),
      // invalidate LIST too. the unread count rides along with the feed, so the
      // badge stays wrong until the list itself refetches
      invalidatesTags: (_result, _error, notificationId) => [
        { type: "Notification", id: notificationId },
        { type: "Notification", id: "LIST" },
      ],
    }),
    markAllNotificationsRead: builder.mutation<{ updated: number }, void>({
      query: () => ({ url: "/notifications/read-all", method: "PATCH" }),
      transformResponse: (response: ApiEnvelope<{ updated: number }>) => response.data,
      invalidatesTags: [{ type: "Notification", id: "LIST" }],
    }),

    // ===== profile =====
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
  useGetUsageQuery,
  useListConversationsQuery,
  useGetConversationQuery,
  useLazyGetConversationQuery,
  useUpdateConversationMutation,
  useDeleteConversationMutation,
  useGetReportQuery,
  useListReportsQuery,
  useListNotificationsQuery,
  useMarkNotificationReadMutation,
  useMarkAllNotificationsReadMutation,
  useUpdateProfileMutation,
  useUploadAvatarMutation,
  useDeleteAvatarMutation,
} = api;
