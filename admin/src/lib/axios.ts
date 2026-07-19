import axios from 'axios'
import { config } from './config'

// ─── Axios instance ───────────────────────────────────
// withCredentials sends the httpOnly auth cookies (no JWT read in JS). Used under
// RTK Query via the axios baseQuery.

export const apiClient = axios.create({
  baseURL: config.apiUrl,
  withCredentials: true,
})
