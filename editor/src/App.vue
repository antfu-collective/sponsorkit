<script setup lang="ts">
import type { Sponsorship } from '../../src/types'
import data from '../../sponsorkit/sponsors.json'

const sponsors = data as any as Sponsorship[]
</script>

<template>
  <div v-for="sponsor of sponsors" :key="sponsor.sponsor.login">
    {{ sponsor.sponsor.name }}
  </div>
</template>
