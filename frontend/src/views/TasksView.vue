<script setup>
import { computed, onMounted, ref } from "vue"
import { useRouter } from "vue-router"
import { useTasksStore } from "../stores/tasks"
import { useAiSuggestionsStore } from "../stores/aiSuggestions"
import TaskForm from "../components/tasks/TaskForm.vue"
import TaskList from "../components/tasks/TaskList.vue"

const tasksStore = useTasksStore()
const aiStore = useAiSuggestionsStore()
const router = useRouter()

const showForm = ref(false)
const editingTask = ref(null)
const statusFilter = ref("")
const priorityFilter = ref("")
const optimizing = ref(false)
const optimizeError = ref("")

const filteredTasks = computed(() => {
  return tasksStore.tasks.filter((t) => {
    if (statusFilter.value && t.status !== statusFilter.value) return false
    if (priorityFilter.value && t.priority !== priorityFilter.value) return false
    return true
  })
})

onMounted(async () => {
  await Promise.all([tasksStore.fetchTasks(), tasksStore.fetchCategories()])
})

function openCreate() {
  editingTask.value = null
  showForm.value = true
}

function openEdit(task) {
  editingTask.value = task
  showForm.value = true
}

async function handleSubmit(payload) {
  if (editingTask.value) {
    await tasksStore.updateTask(editingTask.value.id, payload)
  } else {
    await tasksStore.createTask(payload)
  }
  showForm.value = false
  editingTask.value = null
}

async function handleDelete(task) {
  if (confirm(`Delete "${task.title}"?`)) {
    await tasksStore.deleteTask(task.id)
  }
}

async function handleStatusChange(task, status) {
  await tasksStore.updateTask(task.id, { status })
}

async function handleOptimize() {
  optimizing.value = true
  optimizeError.value = ""
  try {
    const suggestion = await aiStore.requestOptimization(7)
    router.push({ name: "suggested-schedule", params: { id: suggestion.id } })
  } catch (err) {
    optimizeError.value = aiStore.error || "Failed to generate a schedule."
  } finally {
    optimizing.value = false
  }
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h1 class="text-xl font-semibold text-slate-800">Tasks</h1>
      <div class="flex gap-2">
        <button
          class="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          :disabled="optimizing"
          @click="handleOptimize"
        >
          {{ optimizing ? "Optimizing..." : "Optimize My Schedule" }}
        </button>
        <button class="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700" @click="openCreate">
          + New Task
        </button>
      </div>
    </div>

    <p v-if="optimizeError" class="rounded-md bg-rose-50 p-3 text-sm text-rose-600">{{ optimizeError }}</p>

    <TaskForm
      v-if="showForm"
      :task="editingTask"
      :categories="tasksStore.categories"
      @submit="handleSubmit"
      @cancel="showForm = false"
    />

    <div class="flex gap-3">
      <select v-model="statusFilter" class="rounded-md border border-slate-300 px-2 py-1 text-sm">
        <option value="">All statuses</option>
        <option value="pending">Pending</option>
        <option value="scheduled">Scheduled</option>
        <option value="in_progress">In progress</option>
        <option value="completed">Completed</option>
        <option value="cancelled">Cancelled</option>
      </select>
      <select v-model="priorityFilter" class="rounded-md border border-slate-300 px-2 py-1 text-sm">
        <option value="">All priorities</option>
        <option value="low">Low</option>
        <option value="medium">Medium</option>
        <option value="high">High</option>
        <option value="urgent">Urgent</option>
      </select>
    </div>

    <p v-if="tasksStore.loading" class="text-sm text-slate-500">Loading tasks...</p>
    <TaskList
      v-else
      :tasks="filteredTasks"
      @edit="openEdit"
      @delete="handleDelete"
      @status-change="handleStatusChange"
    />
  </div>
</template>
