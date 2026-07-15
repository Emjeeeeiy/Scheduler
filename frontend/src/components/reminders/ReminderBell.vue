<script setup>
import { onMounted, onUnmounted, ref } from "vue"
import { useRemindersStore } from "../../stores/reminders"

const reminders = useRemindersStore()
const open = ref(false)
let pollHandle = null

async function refresh() {
  try {
    await reminders.fetchDueReminders()
  } catch {
    // silently skip a failed poll — next interval will retry
  }
}

async function dismiss(id) {
  await reminders.dismissReminder(id)
}

onMounted(() => {
  refresh()
  pollHandle = setInterval(refresh, 30000)
})

onUnmounted(() => {
  if (pollHandle) clearInterval(pollHandle)
})
</script>

<template>
  <div class="relative">
    <button
      class="relative rounded-md p-2 text-slate-600 hover:bg-slate-100"
      aria-label="Reminders"
      @click="open = !open"
    >
      <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 1 0-12 0v3.2c0 .5-.2 1-.6 1.4L4 17h5m6 0v1a3 3 0 1 1-6 0v-1m6 0H9" />
      </svg>
      <span
        v-if="reminders.unreadCount > 0"
        class="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[10px] font-semibold text-white"
      >
        {{ reminders.unreadCount }}
      </span>
    </button>

    <div
      v-if="open"
      class="absolute right-0 z-20 mt-2 w-72 rounded-lg border border-slate-200 bg-white p-2 shadow-lg"
    >
      <p v-if="reminders.dueReminders.length === 0" class="p-3 text-sm text-slate-500">
        No due reminders.
      </p>
      <div
        v-for="reminder in reminders.dueReminders"
        :key="reminder.id"
        class="flex items-start justify-between gap-2 rounded-md p-2 hover:bg-slate-50"
      >
        <div class="text-sm">
          <p class="font-medium text-slate-800">{{ reminder.message || "Reminder" }}</p>
          <p class="text-xs text-slate-500">{{ new Date(reminder.remind_at).toLocaleString() }}</p>
        </div>
        <button class="text-xs text-indigo-600 hover:underline" @click="dismiss(reminder.id)">
          Dismiss
        </button>
      </div>
    </div>
  </div>
</template>
