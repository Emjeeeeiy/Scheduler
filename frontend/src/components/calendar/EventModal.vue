<script setup>
import { reactive, watch } from "vue"
import { toDatetimeLocal } from "../../utils/datetime"

const props = defineProps({
  event: { type: Object, default: null },
  initialStart: { type: String, default: "" },
})
const emit = defineEmits(["submit", "delete", "close"])

const form = reactive({
  title: "",
  description: "",
  start_time: "",
  end_time: "",
  all_day: false,
})

watch(
  () => [props.event, props.initialStart],
  () => {
    if (props.event) {
      form.title = props.event.title
      form.description = props.event.description
      form.start_time = toDatetimeLocal(props.event.start_time)
      form.end_time = toDatetimeLocal(props.event.end_time)
      form.all_day = props.event.all_day
    } else if (props.initialStart) {
      form.title = ""
      form.description = ""
      form.start_time = toDatetimeLocal(props.initialStart)
      const end = new Date(props.initialStart)
      end.setHours(end.getHours() + 1)
      form.end_time = toDatetimeLocal(end.toISOString())
      form.all_day = false
    }
  },
  { immediate: true }
)

function handleSubmit() {
  emit("submit", {
    title: form.title,
    description: form.description,
    start_time: new Date(form.start_time).toISOString(),
    end_time: new Date(form.end_time).toISOString(),
    all_day: form.all_day,
  })
}
</script>

<template>
  <div class="fixed inset-0 z-30 flex items-center justify-center bg-black/30 p-4" @click.self="emit('close')">
    <form class="w-full max-w-sm space-y-3 rounded-lg bg-white p-5 shadow-xl" @submit.prevent="handleSubmit">
      <h2 class="text-lg font-medium text-slate-700">{{ event ? "Edit event" : "New event" }}</h2>
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
          <label class="mb-1 block text-sm font-medium text-slate-600">Start</label>
          <input v-model="form.start_time" type="datetime-local" required class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label class="mb-1 block text-sm font-medium text-slate-600">End</label>
          <input v-model="form.end_time" type="datetime-local" required class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </div>
      </div>
      <div class="flex items-center justify-between pt-2">
        <button
          v-if="event"
          type="button"
          class="text-sm text-rose-600 hover:underline"
          @click="emit('delete', event)"
        >
          Delete
        </button>
        <div v-else></div>
        <div class="flex gap-2">
          <button type="button" class="rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100" @click="emit('close')">
            Cancel
          </button>
          <button type="submit" class="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700">
            Save
          </button>
        </div>
      </div>
    </form>
  </div>
</template>
