import api from "./api"

export default {
  list(params = {}) {
    return api.get("/tasks/", { params })
  },
  create(payload) {
    return api.post("/tasks/", payload)
  },
  update(id, payload) {
    return api.patch(`/tasks/${id}/`, payload)
  },
  remove(id) {
    return api.delete(`/tasks/${id}/`)
  },
  listCategories() {
    return api.get("/categories/")
  },
  createCategory(payload) {
    return api.post("/categories/", payload)
  },
}
