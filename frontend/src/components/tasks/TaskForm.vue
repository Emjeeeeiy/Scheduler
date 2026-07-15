<script setup>
import { reactive, watch } from "vue"
import { PRIORITIES } from "../../utils/constants"
import { toDatetimeLocal } from "../../utils/datetime"

const props = defineProps({
  task: { type: Object, default: null },
  categories: { type: Array, default: () => [] },
})
const emit = defineEmits(["submit", "cancel"])

const form = reactive({
  title: "",
  description: "",
  priority: "medium",
  deadline: "",
  estimated_duration_minutes: null,
  category: null,
})

watch(
  () => props.task,
  (task) => {
    if (task) {
      form.title = task.title
      form.description = task.description
      form.priority = task.priority
      form.deadline = toDatetimeLocal(task.deadline)
      form.estimated_duration_minutes = task.estimated_duration_minutes
      form.category = task.category
    }
  },
  { immediate: true }
)

function handleSubmit() {
  emit("submit", {
    ...form,
    deadline: form.deadline ? new Date(form.deadline).toISOString() : null,
    estimated_duration_minutes: form.estimated_duration_minutes || null,
    category: form.category || null,
  })
}
</script>

<template>
  <form class="space-y-3 rounded-lg border border-slate-200 bg-white p-4" @submit.prevent="handleSubmit">
    <div>
      <label class="mb-1 block text-sm font-medium text-slate-600">Title</label>
      <input v-model="form.title" required class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
    </div>
    <div>
      <label class="mb-1 block text-sm font-medium text-slate-600">Description</label>
      <textarea v-model="form.description" rows="2" class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"></textarea>
    </div>
    <div class="grid grid-cols-2 gap-3">
      <div>
        <label class="mb-1 block text-sm font-medium text-slate-600">Priority</label>
        <select v-model="form.priority" class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
          <option v-for="p in PRIORITIES" :key="p.value" :value="p.value">{{ p.label }}</option>
        </select>
      </div>
      <div>
        <label class="mb-1 block text-sm font-medium text-slate-600">Category</label>
        <select v-model="form.category" class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
          <option :value="null">None</option>
          <option v-for="c in categories" :key="c.id" :value="c.id">{{ c.name }}</option>
        </select>
      </div>
    </div>
    <div class="grid grid-cols-2 gap-3">
      <div>
        <label class="mb-1 block text-sm font-medium text-slate-600">Deadline</label>
        <input v-model="form.deadline" type="datetime-local" class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
      </div>
      <div>
        <label class="mb-1 block text-sm font-medium text-slate-600">Est. duration (min)</label>
        <input v-model.number="form.estimated_duration_minutes" type="number" min="5" step="5" class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
      </div>
    </div>
    <div class="flex justify-end gap-2 pt-2">
      <button type="button" class="rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100" @click="emit('cancel')">
        Cancel
      </button>
      <button type="submit" class="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700">
        {{ task ? "Save changes" : "Add task" }}
      </button>
    </div>
  </form>
</template>
