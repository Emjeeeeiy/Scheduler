import axios from "axios"

const baseURL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api"

const api = axios.create({ baseURL })

let isRefreshing = false
let refreshQueue = []

api.interceptors.request.use((config) => {
  const accessToken = localStorage.getItem("accessToken")
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config
    const isAuthEndpoint = originalRequest?.url?.includes("/auth/token/")

    if (error.response?.status !== 401 || originalRequest._retry || isAuthEndpoint) {
      return Promise.reject(error)
    }

    const refreshToken = localStorage.getItem("refreshToken")
    if (!refreshToken) {
      return Promise.reject(error)
    }

    originalRequest._retry = true

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        refreshQueue.push({ resolve, reject, originalRequest })
      })
    }

    isRefreshing = true
    try {
      const { data } = await axios.post(`${baseURL}/auth/token/refresh/`, { refresh: refreshToken })
      localStorage.setItem("accessToken", data.access)
      refreshQueue.forEach(({ resolve, originalRequest: req }) => {
        req.headers.Authorization = `Bearer ${data.access}`
        resolve(api(req))
      })
      refreshQueue = []
      originalRequest.headers.Authorization = `Bearer ${data.access}`
      return api(originalRequest)
    } catch (refreshError) {
      refreshQueue.forEach(({ reject }) => reject(refreshError))
      refreshQueue = []
      localStorage.removeItem("accessToken")
      localStorage.removeItem("refreshToken")
      window.location.href = "/login"
      return Promise.reject(refreshError)
    } finally {
      isRefreshing = false
    }
  }
)

export default api
