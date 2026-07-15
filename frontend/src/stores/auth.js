import { defineStore } from "pinia"
import authService from "../services/authService"

export const useAuthStore = defineStore("auth", {
  state: () => ({
    user: null,
    accessToken: localStorage.getItem("accessToken") || null,
    refreshToken: localStorage.getItem("refreshToken") || null,
  }),

  getters: {
    isAuthenticated: (state) => !!state.accessToken,
  },

  actions: {
    setTokens(access, refresh) {
      this.accessToken = access
      this.refreshToken = refresh
      localStorage.setItem("accessToken", access)
      localStorage.setItem("refreshToken", refresh)
    },

    async register(payload) {
      const { data } = await authService.register(payload)
      this.setTokens(data.access, data.refresh)
      this.user = data.user
    },

    async login(payload) {
      const { data } = await authService.login(payload)
      this.setTokens(data.access, data.refresh)
      await this.fetchMe()
    },

    async fetchMe() {
      const { data } = await authService.me()
      this.user = data
    },

    async logout() {
      try {
        if (this.refreshToken) {
          await authService.logout(this.refreshToken)
        }
      } catch {
        // token already invalid/expired — proceed with local logout regardless
      }
      this.user = null
      this.accessToken = null
      this.refreshToken = null
      localStorage.removeItem("accessToken")
      localStorage.removeItem("refreshToken")
    },
  },
})
