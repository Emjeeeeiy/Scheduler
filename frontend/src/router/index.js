import { createRouter, createWebHistory } from "vue-router"
import { useAuthStore } from "../stores/auth"

const routes = [
  { path: "/login", name: "login", component: () => import("../views/LoginView.vue"), meta: { guestOnly: true } },
  { path: "/register", name: "register", component: () => import("../views/RegisterView.vue"), meta: { guestOnly: true } },
  { path: "/", name: "dashboard", component: () => import("../views/DashboardView.vue"), meta: { requiresAuth: true } },
  { path: "/calendar", name: "calendar", component: () => import("../views/CalendarView.vue"), meta: { requiresAuth: true } },
  { path: "/tasks", name: "tasks", component: () => import("../views/TasksView.vue"), meta: { requiresAuth: true } },
  {
    path: "/ai/suggestions/:id?",
    name: "suggested-schedule",
    component: () => import("../views/SuggestedScheduleView.vue"),
    meta: { requiresAuth: true },
  },
  { path: "/settings", name: "settings", component: () => import("../views/SettingsView.vue"), meta: { requiresAuth: true } },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach((to) => {
  const auth = useAuthStore()
  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    return { name: "login" }
  }
  if (to.meta.guestOnly && auth.isAuthenticated) {
    return { name: "dashboard" }
  }
  return true
})

export default router
