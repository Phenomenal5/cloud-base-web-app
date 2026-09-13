import type { BaseQueryFn } from '@reduxjs/toolkit/query'
import { AxiosError, type AxiosRequestConfig } from 'axios'
import { apiClient } from '@/lib/axios'

// lets RTK Query run on axios instead of fetch, so we keep the caching, the tags
// and the generated hooks but still get axios's interceptors and defaults

export interface AxiosQueryArgs {
  url: string
  method?: AxiosRequestConfig['method']
  body?: AxiosRequestConfig['data']
  params?: AxiosRequestConfig['params']
}

// same { status, data } shape fetchBaseQuery uses, so the reauth wrapper and the
// error helpers don't need to care which transport is underneath
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
