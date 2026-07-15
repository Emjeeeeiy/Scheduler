<script setup>
import { PRIORITY_COLORS, TASK_STATUSES } from "../../utils/constants"
import { formatDateTime } from "../../utils/datetime"

defineProps({
  tasks: { type: Array, required: true },
})
const emit = defineEmits(["edit", "delete", "status-change"])
</script>

<template>
  <div class="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
    <p v-if="tasks.length === 0" class="p-6 text-center text-sm text-slate-500">
      No tasks yet. Add one to get started.
    </p>
    <div v-for="task in tasks" :key="task.id" class="flex items-start justify-between gap-3 p-4">
      <div class="min-w-0 flex-1">
        <div class="flex flex-wrap items-center gap-2">
          <p class="font-medium text-slate-800">{{ task.title }}</p>
          <span :class="['rounded-full px-2 py-0.5 text-xs font-medium', PRIORITY_COLORS[task.priority]]">
            {{ task.priority }}
          </span>
        </div>
        <p v-if="task.description" class="mt-1 text-sm text-slate-500">{{ task.description }}</p>
        <div class="mt-1 flex flex-wrap gap-x-4 text-xs text-slate-400">
          <span v-if="task.deadline">Due {{ formatDateTime(task.deadline) }}</span>
          <span v-if="task.estimated_duration_minutes">{{ task.estimated_duration_minutes }} min</span>
          <span v-if="task.category_name">{{ task.category_name }}</span>
        </div>
      </div>
      <div class="flex shrink-0 items-center gap-2">
        <select
          :value="task.status"
          class="rounded-md border border-slate-300 px-2 py-1 text-xs"
          @change="emit('status-change', task, $event.target.value)"
        >
          <option v-for="s in TASK_STATUSES" :key="s.value" :value="s.value">{{ s.label }}</option>
        </select>
        <button class="text-xs text-indigo-600 hover:underline" @click="emit('edit', task)">Edit</button>
        <button class="text-xs text-rose-600 hover:underline" @click="emit('delete', task)">Delete</button>
      </div>
    </div>
  </div>
</template>
