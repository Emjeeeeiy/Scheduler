import api from "./api"

export default {
  register(payload) {
    return api.post("/auth/register/", payload)
  },
  login(payload) {
    return api.post("/auth/token/", payload)
  },
  refresh(refreshToken) {
    return api.post("/auth/token/refresh/", { refresh: refreshToken })
  },
  logout(refreshToken) {
    return api.post("/auth/logout/", { refresh: refreshToken })
  },
  me() {
    return api.get("/auth/me/")
  },
  updateMe(payload) {
    return api.patch("/auth/me/", payload)
  },
}
