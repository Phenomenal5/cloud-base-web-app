import { createApi, type BaseQueryFn } from '@reduxjs/toolkit/query/react'
import type {
  ApiEnvelope,
  User,
  UserPage,
  IngestionJob,
  Role,
  UserStatus,
  Metrics,
} from '@/lib/types'
import { axiosBaseQuery, type AxiosQueryArgs, type AxiosQueryError } from './axiosBaseQuery'
import { clearUser } from './authSlice'

// ─── The admin HTTP client (RTK Query over axios) ─────
// On a 401 for a protected route, rotate the session via /auth/refresh once and
// retry; if that fails, clear the user.

const rawBaseQuery = axiosBaseQuery()
let refreshPromise: ReturnType<typeof rawBaseQuery> | null = null

const baseQueryWithReauth: BaseQueryFn<AxiosQueryArgs | string, unknown, AxiosQueryError> = async (
  queryArgs,
  baseQueryApi,
  extraOptions,
) => {
  let result = await rawBaseQuery(queryArgs, baseQueryApi, extraOptions)

  const requestUrl = typeof queryArgs === 'string' ? queryArgs : queryArgs.url
  const isAuthRoute = requestUrl.startsWith('/auth/')

  if (result.error?.status === 401 && !isAuthRoute) {
    if (!refreshPromise) {
      refreshPromise = rawBaseQuery({ url: '/auth/refresh', method: 'POST' }, baseQueryApi, extraOptions)
    }
    const refreshResult = await refreshPromise
    refreshPromise = null

    if (refreshResult.data) {
      result = await rawBaseQuery(queryArgs, baseQueryApi, extraOptions)
    } else {
      baseQueryApi.dispatch(clearUser())
    }
  }

  return result
}

export const api = createApi({
  reducerPath: 'api',
  baseQuery: baseQueryWithReauth,
  tagTypes: ['User', 'IngestionJob'],
  endpoints: (builder) => ({
    // ── Dashboard ──
    metrics: builder.query<Metrics, void>({
      query: () => '/admin/metrics',
      transformResponse: (response: ApiEnvelope<Metrics>) => response.data,
      providesTags: [{ type: 'User', id: 'LIST' }, { type: 'IngestionJob', id: 'LIST' }],
    }),

    // ── Session ──
    me: builder.query<User, void>({
      query: () => '/auth/me',
      transformResponse: (response: ApiEnvelope<{ user: User }>) => response.data.user,
      providesTags: [{ type: 'User', id: 'ME' }],
    }),
    login: builder.mutation<User, { email: string; password: string }>({
      query: (body) => ({ url: '/auth/login', method: 'POST', body }),
      transformResponse: (response: ApiEnvelope<{ user: User }>) => response.data.user,
      invalidatesTags: [{ type: 'User', id: 'ME' }],
    }),
    logout: builder.mutation<unknown, void>({
      query: () => ({ url: '/auth/logout', method: 'POST' }),
      invalidatesTags: [{ type: 'User', id: 'ME' }],
    }),

    // ── Users ──
    listUsers: builder.query<
      UserPage,
      { search?: string; role?: Role; status?: UserStatus; page?: number } | void
    >({
      query: (args) => ({
        url: '/admin/users',
        params: {
          ...(args && args.search ? { search: args.search } : {}),
          ...(args && args.role ? { role: args.role } : {}),
          ...(args && args.status ? { status: args.status } : {}),
          ...(args && args.page ? { page: args.page } : {}),
        },
      }),
      transformResponse: (response: ApiEnvelope<UserPage>) => response.data,
      providesTags: [{ type: 'User', id: 'LIST' }],
    }),
    updateUserRole: builder.mutation<unknown, { id: string; role: Role }>({
      query: ({ id, role }) => ({ url: `/admin/users/${id}/role`, method: 'PATCH', body: { role } }),
      invalidatesTags: [{ type: 'User', id: 'LIST' }],
    }),
    updateUserStatus: builder.mutation<unknown, { id: string; status: UserStatus }>({
      query: ({ id, status }) => ({
        url: `/admin/users/${id}/status`,
        method: 'PATCH',
        body: { status },
      }),
      invalidatesTags: [{ type: 'User', id: 'LIST' }],
    }),

    // ── Ingestion ──
    listIngestions: builder.query<IngestionJob[], void>({
      query: () => '/admin/ingestions',
      transformResponse: (response: ApiEnvelope<{ jobs: IngestionJob[] }>) => response.data.jobs,
      providesTags: [{ type: 'IngestionJob', id: 'LIST' }],
    }),
    uploadIngestion: builder.mutation<IngestionJob, FormData>({
      query: (formData) => ({ url: '/admin/ingestions', method: 'POST', body: formData }),
      transformResponse: (response: ApiEnvelope<{ job: IngestionJob }>) => response.data.job,
      invalidatesTags: [{ type: 'IngestionJob', id: 'LIST' }],
    }),

    // ── Broadcast ──
    broadcast: builder.mutation<{ recipients: number }, { title: string; body: string }>({
      query: (body) => ({ url: '/admin/notifications', method: 'POST', body }),
      transformResponse: (response: ApiEnvelope<{ recipients: number }>) => response.data,
    }),
  }),
})

export const {
  useMetricsQuery,
  useMeQuery,
  useLoginMutation,
  useLogoutMutation,
  useListUsersQuery,
  useUpdateUserRoleMutation,
  useUpdateUserStatusMutation,
  useListIngestionsQuery,
  useUploadIngestionMutation,
  useBroadcastMutation,
} = api
