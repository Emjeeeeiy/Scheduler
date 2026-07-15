import api from "./api"

export default {
  requestOptimization(horizonDays) {
    return api.post("/ai/optimize-schedule/", { horizon_days: horizonDays })
  },
  list() {
    return api.get("/ai/optimize-schedule/")
  },
  get(id) {
    return api.get(`/ai/optimize-schedule/${id}/`)
  },
  accept(id, itemIds, overrides) {
    return api.post(`/ai/optimize-schedule/${id}/accept/`, { item_ids: itemIds, overrides })
  },
  reject(id, itemIds) {
    return api.post(`/ai/optimize-schedule/${id}/reject/`, { item_ids: itemIds })
  },
}
