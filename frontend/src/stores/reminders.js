import { defineStore } from "pinia"
import reminderService from "../services/reminderService"

export const useRemindersStore = defineStore("reminders", {
  state: () => ({
    reminders: [],
    dueReminders: [],
  }),

  getters: {
    unreadCount: (state) => state.dueReminders.length,
  },

  actions: {
    async fetchReminders(params = {}) {
      const { data } = await reminderService.list(params)
      this.reminders = data.results ?? data
    },

    async fetchDueReminders() {
      const { data } = await reminderService.list({ due: true })
      this.dueReminders = data.results ?? data
    },

    async createReminder(payload) {
      const { data } = await reminderService.create(payload)
      this.reminders.unshift(data)
      return data
    },

    async dismissReminder(id) {
      await reminderService.dismiss(id)
      this.dueReminders = this.dueReminders.filter((r) => r.id !== id)
      this.reminders = this.reminders.filter((r) => r.id !== id)
    },

    async deleteReminder(id) {
      await reminderService.remove(id)
      this.reminders = this.reminders.filter((r) => r.id !== id)
      this.dueReminders = this.dueReminders.filter((r) => r.id !== id)
    },
  },
})
