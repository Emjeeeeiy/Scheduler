<script setup>
import { computed, onMounted, ref } from "vue"
import { useRouter } from "vue-router"
import { useTasksStore } from "../stores/tasks"
import { useEventsStore } from "../stores/events"
import { useAiSuggestionsStore } from "../stores/aiSuggestions"
import { formatDateTime } from "../utils/datetime"

const tasksStore = useTasksStore()
const eventsStore = useEventsStore()
const aiStore = useAiSuggestionsStore()
const router = useRouter()

const optimizing = ref(false)
const optimizeError = ref("")

const upcomingTasks = computed(() =>
  [...tasksStore.tasks]
    .filter((t) => t.status === "pending" && t.deadline)
    .sort((a, b) => new Date(a.deadline) - new Date(b.deadline))
    .slice(0, 5)
)

const todaysEvents = computed(() => {
  const today = new Date().toDateString()
  return eventsStore.events
    .filter((e) => new Date(e.start_time).toDateString() === today)
    .sort((a, b) => new Date(a.start_time) - new Date(b.start_time))
})

onMounted(async () => {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000)
  await Promise.all([
    tasksStore.fetchTasks({ status: "pending", ordering: "deadline" }),
    eventsStore.fetchEvents({ start: start.toISOString(), end: end.toISOString() }),
  ])
})

async function handleOptimize() {
  optimizing.value = true
  optimizeError.value = ""
  try {
    const suggestion = await aiStore.requestOptimization(7)
    router.push({ name: "suggested-schedule", params: { id: suggestion.id } })
  } catch {
    optimizeError.value = aiStore.error || "Failed to generate a schedule."
  } finally {
    optimizing.value = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h1 class="text-xl font-semibold text-slate-800">Dashboard</h1>
      <button
        class="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        :disabled="optimizing"
        @click="handleOptimize"
      >
        {{ optimizing ? "Optimizing..." : "Optimize My Schedule" }}
      </button>
    </div>
    <p v-if="optimizeError" class="rounded-md bg-rose-50 p-3 text-sm text-rose-600">{{ optimizeError }}</p>

    <div class="grid gap-4 sm:grid-cols-2">
      <div class="rounded-lg border border-slate-200 bg-white p-4">
        <h2 class="mb-3 font-medium text-slate-700">Upcoming tasks</h2>
        <p v-if="upcomingTasks.length === 0" class="text-sm text-slate-500">No upcoming deadlines.</p>
        <ul class="space-y-2">
          <li v-for="task in upcomingTasks" :key="task.id" class="text-sm">
            <span class="font-medium text-slate-800">{{ task.title }}</span>
            <span class="text-slate-500"> &middot; due {{ formatDateTime(task.deadline) }}</span>
          </li>
        </ul>
      </div>
      <div class="rounded-lg border border-slate-200 bg-white p-4">
        <h2 class="mb-3 font-medium text-slate-700">Today's events</h2>
        <p v-if="todaysEvents.length === 0" class="text-sm text-slate-500">Nothing scheduled today.</p>
        <ul class="space-y-2">
          <li v-for="event in todaysEvents" :key="event.id" class="text-sm">
            <span class="font-medium text-slate-800">{{ event.title }}</span>
            <span class="text-slate-500"> &middot; {{ formatDateTime(event.start_time) }}</span>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>
