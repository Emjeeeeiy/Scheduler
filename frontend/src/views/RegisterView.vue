<script setup>
import { ref } from "vue"
import { useRouter } from "vue-router"
import { useAuthStore } from "../stores/auth"

const auth = useAuthStore()
const router = useRouter()

const form = ref({ username: "", email: "", password: "" })
const error = ref("")
const loading = ref(false)

async function handleSubmit() {
  error.value = ""
  loading.value = true
  try {
    await auth.register(form.value)
    router.push({ name: "dashboard" })
  } catch (err) {
    const data = err.response?.data
    error.value = data ? Object.values(data).flat().join(" ") : "Registration failed."
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="mx-auto mt-16 max-w-sm">
    <h1 class="mb-6 text-center text-2xl font-semibold text-slate-800">Smart Scheduler</h1>
    <form class="space-y-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm" @submit.prevent="handleSubmit">
      <h2 class="text-lg font-medium text-slate-700">Create an account</h2>
      <div>
        <label class="mb-1 block text-sm font-medium text-slate-600">Username</label>
        <input v-model="form.username" type="text" required class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none" />
      </div>
      <div>
        <label class="mb-1 block text-sm font-medium text-slate-600">Email</label>
        <input v-model="form.email" type="email" required class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none" />
      </div>
      <div>
        <label class="mb-1 block text-sm font-medium text-slate-600">Password</label>
        <input v-model="form.password" type="password" required minlength="8" class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none" />
      </div>
      <p v-if="error" class="text-sm text-rose-600">{{ error }}</p>
      <button type="submit" :disabled="loading" class="w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
        {{ loading ? "Creating account..." : "Register" }}
      </button>
      <p class="text-center text-sm text-slate-500">
        Already have an account?
        <RouterLink to="/login" class="text-indigo-600 hover:underline">Log in</RouterLink>
      </p>
    </form>
  </div>
</template>
