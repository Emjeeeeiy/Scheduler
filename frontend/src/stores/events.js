import { defineStore } from "pinia"
import eventService from "../services/eventService"

export const useEventsStore = defineStore("events", {
  state: () => ({
    events: [],
    loading: false,
    error: null,
  }),

  actions: {
    async fetchEvents(params = {}) {
      this.loading = true
      this.error = null
      try {
        const { data } = await eventService.list(params)
        this.events = data.results ?? data
      } catch (err) {
        this.error = err.response?.data?.detail || "Failed to load events."
        throw err
      } finally {
        this.loading = false
      }
    },

    async createEvent(payload) {
      const { data } = await eventService.create(payload)
      this.events.push(data)
      return data
    },

    async updateEvent(id, payload) {
      const { data } = await eventService.update(id, payload)
      const index = this.events.findIndex((e) => e.id === id)
      if (index !== -1) this.events[index] = data
      return data
    },

    async moveEvent(id, start, end) {
      return this.updateEvent(id, { start_time: start, end_time: end })
    },

    async deleteEvent(id) {
      await eventService.remove(id)
      this.events = this.events.filter((e) => e.id !== id)
    },
  },
})
