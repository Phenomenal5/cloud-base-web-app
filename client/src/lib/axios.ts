import axios from "axios";
import { config } from "./config";

// withCredentials is axios's equivalent of fetch's credentials: "include", which
// is what sends the httpOnly auth cookies. No JWT is ever read from JS.
export const apiClient = axios.create({
  baseURL: config.apiUrl,
  withCredentials: true,
});
