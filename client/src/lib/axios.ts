import axios from "axios";
import { config } from "./config";

// withCredentials is axios's version of fetch's credentials: "include". it's what
// sends the httpOnly auth cookies, and no JS here ever touches a JWT directly
export const apiClient = axios.create({
  baseURL: config.apiUrl,
  withCredentials: true,
});
