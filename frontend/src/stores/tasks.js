import { defineStore } from "pinia"
import taskService from "../services/taskService"

export const useTasksStore = defineStore("tasks", {
  state: () => ({
    tasks: [],
    categories: [],
    loading: false,
    error: null,
  }),

  getters: {
    pendingTasks: (state) => state.tasks.filter((t) => t.status === "pending"),
  },

  actions: {
    async fetchTasks(params = {}) {
      this.loading = true
      this.error = null
      try {
        const { data } = await taskService.list(params)
        this.tasks = data.results ?? data
      } catch (err) {
        this.error = err.response?.data?.detail || "Failed to load tasks."
        throw err
      } finally {
        this.loading = false
      }
    },

    async fetchCategories() {
      const { data } = await taskService.listCategories()
      this.categories = data.results ?? data
    },

    async createTask(payload) {
      const { data } = await taskService.create(payload)
      this.tasks.unshift(data)
      return data
    },

    async updateTask(id, payload) {
      const { data } = await taskService.update(id, payload)
      const index = this.tasks.findIndex((t) => t.id === id)
      if (index !== -1) this.tasks[index] = data
      return data
    },

    async deleteTask(id) {
      await taskService.remove(id)
      this.tasks = this.tasks.filter((t) => t.id !== id)
    },

    async createCategory(payload) {
      const { data } = await taskService.createCategory(payload)
      this.categories.push(data)
      return data
    },
  },
})
