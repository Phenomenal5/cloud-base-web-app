import type { BaseQueryFn } from '@reduxjs/toolkit/query'
import { AxiosError, type AxiosRequestConfig } from 'axios'
import { apiClient } from '@/lib/axios'

// ─── Axios baseQuery for RTK Query ────────────────────
// Lets RTK Query use axios as its transport while keeping caching/tags/hooks.

export interface AxiosQueryArgs {
  url: string
  method?: AxiosRequestConfig['method']
  body?: AxiosRequestConfig['data']
  params?: AxiosRequestConfig['params']
}

export interface AxiosQueryError {
  status?: number
  data?: unknown
}

export const axiosBaseQuery =
  (): BaseQueryFn<AxiosQueryArgs | string, unknown, AxiosQueryError> => async (queryArgs) => {
    const requestConfig: AxiosQueryArgs =
      typeof queryArgs === 'string' ? { url: queryArgs } : queryArgs
    try {
      const response = await apiClient({
        url: requestConfig.url,
        method: requestConfig.method ?? 'GET',
        data: requestConfig.body,
        params: requestConfig.params,
      })
      return { data: response.data }
    } catch (requestError) {
      const axiosError = requestError as AxiosError
      return {
        error: {
          status: axiosError.response?.status,
          data: axiosError.response?.data ?? axiosError.message,
        },
      }
    }
  }
