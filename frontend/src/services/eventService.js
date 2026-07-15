import api from "./api"

export default {
  list(params = {}) {
    return api.get("/events/", { params })
  },
  create(payload) {
    return api.post("/events/", payload)
  },
  update(id, payload) {
    return api.patch(`/events/${id}/`, payload)
  },
  remove(id) {
    return api.delete(`/events/${id}/`)
  },
  freeBusy(start, end) {
    return api.get("/events/free-busy/", { params: { start, end } })
  },
}
