<script setup>
import { computed, onMounted, ref } from "vue"
import FullCalendar from "@fullcalendar/vue3"
import dayGridPlugin from "@fullcalendar/daygrid"
import timeGridPlugin from "@fullcalendar/timegrid"
import interactionPlugin from "@fullcalendar/interaction"
import { useEventsStore } from "../stores/events"
import EventModal from "../components/calendar/EventModal.vue"

const eventsStore = useEventsStore()

const showModal = ref(false)
const activeEvent = ref(null)
const initialStart = ref("")

const calendarEvents = computed(() =>
  eventsStore.events.map((e) => ({
    id: String(e.id),
    title: e.title,
    start: e.start_time,
    end: e.end_time,
    allDay: e.all_day,
    backgroundColor: e.source === "ai_suggestion" ? "#f59e0b" : "#4f46e5",
    borderColor: e.source === "ai_suggestion" ? "#f59e0b" : "#4f46e5",
    extendedProps: { raw: e },
  }))
)

async function loadRange(start, end) {
  await eventsStore.fetchEvents({ start: start.toISOString(), end: end.toISOString() })
}

const calendarOptions = {
  plugins: [dayGridPlugin, timeGridPlugin, interactionPlugin],
  initialView: "timeGridWeek",
  headerToolbar: {
    left: "prev,next today",
    center: "title",
    right: "dayGridMonth,timeGridWeek,timeGridDay",
  },
  editable: true,
  selectable: true,
  events: calendarEvents,
  datesSet: (info) => loadRange(info.start, info.end),
  dateClick: (info) => {
    activeEvent.value = null
    initialStart.value = info.dateStr
    showModal.value = true
  },
  eventClick: (info) => {
    activeEvent.value = info.event.extendedProps.raw
    initialStart.value = ""
    showModal.value = true
  },
  eventDrop: async (info) => {
    await eventsStore.moveEvent(
      info.event.id,
      info.event.start.toISOString(),
      (info.event.end || info.event.start).toISOString()
    )
  },
  eventResize: async (info) => {
    await eventsStore.moveEvent(info.event.id, info.event.start.toISOString(), info.event.end.toISOString())
  },
}

onMounted(() => {
  const now = new Date()
  loadRange(new Date(now.getFullYear(), now.getMonth(), 1), new Date(now.getFullYear(), now.getMonth() + 1, 1))
})

async function handleSubmit(payload) {
  if (activeEvent.value) {
    await eventsStore.updateEvent(activeEvent.value.id, payload)
  } else {
    await eventsStore.createEvent(payload)
  }
  showModal.value = false
}

async function handleDelete(event) {
  if (confirm(`Delete "${event.title}"?`)) {
    await eventsStore.deleteEvent(event.id)
    showModal.value = false
  }
}
</script>

<template>
  <div class="space-y-4">
    <h1 class="text-xl font-semibold text-slate-800">Calendar</h1>
    <div class="rounded-lg border border-slate-200 bg-white p-3">
      <FullCalendar :options="calendarOptions" />
    </div>
    <EventModal
      v-if="showModal"
      :event="activeEvent"
      :initial-start="initialStart"
      @submit="handleSubmit"
      @delete="handleDelete"
      @close="showModal = false"
    />
  </div>
</template>
