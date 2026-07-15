<script setup>
import { reactive } from "vue"
import { formatDateTime, toDatetimeLocal } from "../../utils/datetime"

const props = defineProps({
  item: { type: Object, required: true },
  decision: { type: String, default: null }, // 'accept' | 'reject' | null (local, unconfirmed)
  override: { type: Object, default: null },
})
const emit = defineEmits(["accept", "reject", "edit"])

const editing = reactive({ active: false, start: "", end: "" })

function startEdit() {
  editing.start = toDatetimeLocal(props.override?.start || props.item.proposed_start)
  editing.end = toDatetimeLocal(props.override?.end || props.item.proposed_end)
  editing.active = true
}

function saveEdit() {
  emit("edit", props.item.id, {
    start: new Date(editing.start).toISOString(),
    end: new Date(editing.end).toISOString(),
  })
  editing.active = false
}
</script>

<template>
  <div class="rounded-lg border border-amber-200 bg-amber-50 p-4">
    <div class="flex flex-wrap items-start justify-between gap-2">
      <div>
        <p class="font-medium text-slate-800">{{ item.task_title }}</p>
        <p class="text-sm text-slate-600">
          {{ formatDateTime(override?.start || item.proposed_start) }} &ndash;
          {{ formatDateTime(override?.end || item.proposed_end) }}
        </p>
      </div>
      <span
        v-if="item.accepted === true || decision === 'accept'"
        class="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700"
      >Marked accepted</span>
      <span
        v-else-if="item.accepted === false || decision === 'reject'"
        class="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600"
      >Marked rejected</span>
    </div>
    <p v-if="item.reasoning" class="mt-2 text-sm text-slate-600">{{ item.reasoning }}</p>

    <div v-if="editing.active" class="mt-3 grid grid-cols-2 gap-2">
      <input v-model="editing.start" type="datetime-local" class="rounded-md border border-slate-300 px-2 py-1 text-sm" />
      <input v-model="editing.end" type="datetime-local" class="rounded-md border border-slate-300 px-2 py-1 text-sm" />
      <div class="col-span-2 flex justify-end gap-2">
        <button class="text-xs text-slate-500 hover:underline" @click="editing.active = false">Cancel</button>
        <button class="text-xs text-indigo-600 hover:underline" @click="saveEdit">Save time</button>
      </div>
    </div>

    <div v-if="item.accepted === null" class="mt-3 flex gap-3">
      <button
        :class="['text-sm font-medium hover:underline', decision === 'accept' ? 'text-emerald-800' : 'text-emerald-700']"
        @click="emit('accept', item.id)"
      >
        Accept
      </button>
      <button
        :class="['text-sm font-medium hover:underline', decision === 'reject' ? 'text-rose-800' : 'text-rose-600']"
        @click="emit('reject', item.id)"
      >
        Reject
      </button>
      <button class="text-sm text-slate-500 hover:underline" @click="startEdit">Edit time</button>
    </div>
  </div>
</template>
