import { defineStore } from "pinia"
import aiService from "../services/aiService"

export const useAiSuggestionsStore = defineStore("aiSuggestions", {
  state: () => ({
    currentSuggestion: null,
    history: [],
    loading: false,
    error: null,
  }),

  actions: {
    async requestOptimization(horizonDays = 7) {
      this.loading = true
      this.error = null
      try {
        const { data } = await aiService.requestOptimization(horizonDays)
        this.currentSuggestion = data
        return data
      } catch (err) {
        this.error = err.response?.data?.error_message || err.response?.data?.detail || "Failed to generate a schedule suggestion."
        throw err
      } finally {
        this.loading = false
      }
    },

    async fetchHistory() {
      const { data } = await aiService.list()
      this.history = data.results ?? data
    },

    async fetchSuggestion(id) {
      const { data } = await aiService.get(id)
      this.currentSuggestion = data
      return data
    },

    async acceptSuggestion(id, itemIds, overrides) {
      const { data } = await aiService.accept(id, itemIds, overrides)
      this.currentSuggestion = data.suggestion
      return data
    },

    async rejectSuggestion(id, itemIds) {
      const { data } = await aiService.reject(id, itemIds)
      this.currentSuggestion = data
      return data
    },
  },
})
