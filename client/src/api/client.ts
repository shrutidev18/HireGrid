import axios from "axios";

// one axios instance for the whole app so baseURL + cookie settings
// don't have to be repeated in every api file
export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:5000/api",
  withCredentials: true, // needed so the JWT cookie actually gets sent/received
});
