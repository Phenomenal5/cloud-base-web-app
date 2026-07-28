import type { BaseQueryFn } from "@reduxjs/toolkit/query";
import { AxiosError, type AxiosRequestConfig } from "axios";
import { apiClient } from "@/lib/axios";

// Lets RTK Query use axios as its transport instead of fetch, so we keep the
// caching, tags and generated hooks while still getting axios's ergonomics.

export interface AxiosQueryArgs {
  url: string;
  method?: AxiosRequestConfig["method"];
  body?: AxiosRequestConfig["data"];
  params?: AxiosRequestConfig["params"];
  headers?: AxiosRequestConfig["headers"];
}

// Kept compatible with fetchBaseQuery's { status, data }, so reauth and error
// handling read the same everywhere.
export interface AxiosQueryError {
  status?: number;
  data?: unknown;
}

export const axiosBaseQuery =
  (): BaseQueryFn<AxiosQueryArgs | string, unknown, AxiosQueryError> => async (queryArgs) => {
    const requestConfig: AxiosQueryArgs =
      typeof queryArgs === "string" ? { url: queryArgs } : queryArgs;

    try {
      const response = await apiClient({
        url: requestConfig.url,
        method: requestConfig.method ?? "GET",
        data: requestConfig.body,
        params: requestConfig.params,
        headers: requestConfig.headers,
      });
      return { data: response.data };
    } catch (requestError) {
      const axiosError = requestError as AxiosError;
      return {
        error: {
          status: axiosError.response?.status,
          data: axiosError.response?.data ?? axiosError.message,
        },
      };
    }
  };
