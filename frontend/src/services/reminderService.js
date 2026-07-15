import api from "./api"

export default {
  list(params = {}) {
    return api.get("/reminders/", { params })
  },
  create(payload) {
    return api.post("/reminders/", payload)
  },
  remove(id) {
    return api.delete(`/reminders/${id}/`)
  },
  dismiss(id) {
    return api.post(`/reminders/${id}/dismiss/`)
  },
}
