<script setup>
import { computed, onMounted, reactive, ref } from "vue"
import { useRoute, useRouter } from "vue-router"
import { useAiSuggestionsStore } from "../stores/aiSuggestions"
import { useEventsStore } from "../stores/events"
import { useTasksStore } from "../stores/tasks"
import SuggestionCard from "../components/ai/SuggestionCard.vue"

const route = useRoute()
const router = useRouter()
const aiStore = useAiSuggestionsStore()
const eventsStore = useEventsStore()
const tasksStore = useTasksStore()

const decisions = reactive({})
const overrides = reactive({})
const confirming = ref(false)
const confirmError = ref("")
const confirmResult = ref(null)

const suggestion = computed(() => aiStore.currentSuggestion)
const undecidedItems = computed(() => suggestion.value?.items.filter((i) => i.accepted === null) ?? [])
const hasDecisions = computed(() => Object.keys(decisions).length > 0)

onMounted(async () => {
  if (route.params.id) {
    await aiStore.fetchSuggestion(route.params.id)
  }
})

function setDecision(itemId, decision) {
  decisions[itemId] = decisions[itemId] === decision ? undefined : decision
  if (!decisions[itemId]) delete decisions[itemId]
}

function setOverride(itemId, override) {
  overrides[itemId] = override
}

async function handleConfirm() {
  confirming.value = true
  confirmError.value = ""
  try {
    const acceptIds = Object.entries(decisions).filter(([, d]) => d === "accept").map(([id]) => Number(id))
    const rejectIds = Object.entries(decisions).filter(([, d]) => d === "reject").map(([id]) => Number(id))

    if (acceptIds.length > 0) {
      const acceptOverrides = {}
      acceptIds.forEach((id) => {
        if (overrides[id]) acceptOverrides[id] = overrides[id]
      })
      const result = await aiStore.acceptSuggestion(suggestion.value.id, acceptIds, acceptOverrides)
      confirmResult.value = result
    }
    if (rejectIds.length > 0) {
      await aiStore.rejectSuggestion(suggestion.value.id, rejectIds)
    }

    await Promise.all([eventsStore.fetchEvents({}), tasksStore.fetchTasks()])
    for (const key of Object.keys(decisions)) delete decisions[key]
  } catch (err) {
    confirmError.value = err.response?.data?.item_ids?.[0] || "Failed to apply your decisions."
  } finally {
    confirming.value = false
  }
}
</script>

<template>
  <div class="space-y-4">
    <h1 class="text-xl font-semibold text-slate-800">Suggested Schedule</h1>

    <div v-if="!suggestion" class="text-sm text-slate-500">No suggestion loaded.</div>

    <div v-else-if="suggestion.status === 'failed'" class="rounded-md bg-rose-50 p-4 text-sm text-rose-700">
      Could not generate a schedule: {{ suggestion.error_message }}
    </div>

    <template v-else>
      <p v-if="suggestion.overall_reasoning" class="rounded-md bg-slate-100 p-3 text-sm text-slate-600">
        {{ suggestion.overall_reasoning }}
      </p>

      <div class="space-y-3">
        <SuggestionCard
          v-for="item in suggestion.items"
          :key="item.id"
          :item="item"
          :decision="decisions[item.id]"
          :override="overrides[item.id]"
          @accept="setDecision(item.id, 'accept')"
          @reject="setDecision(item.id, 'reject')"
          @edit="setOverride"
        />
        <p v-if="suggestion.items.length === 0" class="text-sm text-slate-500">
          No suggested items — all pending tasks were either scheduled already or couldn't fit into your free time.
        </p>
      </div>

      <p v-if="confirmResult?.skipped?.length" class="rounded-md bg-amber-50 p-3 text-sm text-amber-700">
        Some items couldn't be applied due to new conflicts: {{ confirmResult.skipped.map((s) => s.reason).join(" ") }}
      </p>
      <p v-if="confirmError" class="rounded-md bg-rose-50 p-3 text-sm text-rose-600">{{ confirmError }}</p>

      <div v-if="undecidedItems.length > 0" class="flex items-center gap-3">
        <button
          class="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          :disabled="!hasDecisions || confirming"
          @click="handleConfirm"
        >
          {{ confirming ? "Applying..." : "Confirm Selected" }}
        </button>
        <span class="text-sm text-slate-500">Accept or reject items above, then confirm.</span>
      </div>
      <div v-else class="pt-2">
        <button class="text-sm text-indigo-600 hover:underline" @click="router.push({ name: 'calendar' })">
          View on calendar &rarr;
        </button>
      </div>
    </template>
  </div>
</template>
