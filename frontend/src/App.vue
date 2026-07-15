<script setup>
import { useRoute } from "vue-router"
import NavBar from "./components/layout/NavBar.vue"

const route = useRoute()
</script>

<template>
  <div class="min-h-full">
    <NavBar v-if="!route.meta.guestOnly" />
    <main class="mx-auto max-w-6xl px-4 py-6">
      <RouterView />
    </main>
  </div>
</template>
