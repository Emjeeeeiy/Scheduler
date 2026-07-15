<script setup>
import { useRouter } from "vue-router"
import { useAuthStore } from "../../stores/auth"
import ReminderBell from "../reminders/ReminderBell.vue"

const auth = useAuthStore()
const router = useRouter()

const links = [
  { to: "/", label: "Dashboard" },
  { to: "/calendar", label: "Calendar" },
  { to: "/tasks", label: "Tasks" },
  { to: "/settings", label: "Settings" },
]

async function handleLogout() {
  await auth.logout()
  router.push({ name: "login" })
}
</script>

<template>
  <nav class="border-b border-slate-200 bg-white">
    <div class="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
      <div class="flex items-center gap-6">
        <span class="text-lg font-semibold text-indigo-600">Smart Scheduler</span>
        <div class="hidden gap-4 sm:flex">
          <RouterLink
            v-for="link in links"
            :key="link.to"
            :to="link.to"
            class="text-sm font-medium text-slate-600 hover:text-indigo-600"
            active-class="text-indigo-600"
          >
            {{ link.label }}
          </RouterLink>
        </div>
      </div>
      <div class="flex items-center gap-4">
        <ReminderBell />
        <span class="hidden text-sm text-slate-500 sm:inline">{{ auth.user?.username }}</span>
        <button
          class="rounded-md bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-200"
          @click="handleLogout"
        >
          Log out
        </button>
      </div>
    </div>
  </nav>
</template>
