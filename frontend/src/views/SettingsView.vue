<script setup>
import { onMounted, reactive, ref } from "vue"
import { useAuthStore } from "../stores/auth"
import authService from "../services/authService"

const auth = useAuthStore()
const form = reactive({ first_name: "", last_name: "", timezone: "UTC" })
const saving = ref(false)
const saved = ref(false)

onMounted(async () => {
  if (!auth.user) await auth.fetchMe()
  if (auth.user) {
    form.first_name = auth.user.first_name
    form.last_name = auth.user.last_name
    form.timezone = auth.user.timezone
  }
})

async function handleSave() {
  saving.value = true
  saved.value = false
  try {
    const { data } = await authService.updateMe(form)
    auth.user = data
    saved.value = true
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="max-w-md space-y-4">
    <h1 class="text-xl font-semibold text-slate-800">Settings</h1>
    <form class="space-y-3 rounded-lg border border-slate-200 bg-white p-4" @submit.prevent="handleSave">
      <div>
        <label class="mb-1 block text-sm font-medium text-slate-600">Username</label>
        <input :value="auth.user?.username" disabled class="w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500" />
      </div>
      <div>
        <label class="mb-1 block text-sm font-medium text-slate-600">Email</label>
        <input :value="auth.user?.email" disabled class="w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500" />
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="mb-1 block text-sm font-medium text-slate-600">First name</label>
          <input v-model="form.first_name" class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label class="mb-1 block text-sm font-medium text-slate-600">Last name</label>
          <input v-model="form.last_name" class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </div>
      </div>
      <div>
        <label class="mb-1 block text-sm font-medium text-slate-600">Timezone</label>
        <input v-model="form.timezone" placeholder="e.g. America/Los_Angeles" class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
      </div>
      <button type="submit" :disabled="saving" class="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
        {{ saving ? "Saving..." : "Save changes" }}
      </button>
      <span v-if="saved" class="ml-3 text-sm text-emerald-600">Saved.</span>
    </form>
  </div>
</template>
