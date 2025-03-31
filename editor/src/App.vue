<script setup lang="ts">
import type { Sponsorship } from 'sponsorkit'
import data from '../../sponsorkit/sponsors.json'
import Lamp from './components/Lamp.vue'

const sponsors = data as any as Sponsorship[]
</script>

<template>
  <div relative w-1526px>
    <img src="/frame.png" alt="Lamp" w-1526px>
    <div flex="~ cols-10 wrap gap-x-6px gap-y-24px" absolute inset-0 pl-172px pt-246px pr-100px>
      <div v-for="sponsor of sponsors" :key="sponsor.sponsor.login">
        <Lamp :sponsor />
      </div>
    </div>
  </div>
</template>
