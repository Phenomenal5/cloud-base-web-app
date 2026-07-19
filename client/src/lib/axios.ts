import axios from "axios";
import { config } from "./config";

// ─── Axios instance ───────────────────────────────────
// The app's HTTP transport. `withCredentials` sends the httpOnly auth cookies
// (axios's equivalent of fetch `credentials: "include"`). Used under RTK Query
// via the axios baseQuery — no JWT is ever read in JS.

export const apiClient = axios.create({
  baseURL: config.apiUrl,
  withCredentials: true,
});
