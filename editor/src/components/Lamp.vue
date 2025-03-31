<script setup lang="ts">
import type { Sponsorship } from '../../../src/types'

const props = defineProps<{
  sponsor?: Sponsorship
}>()
</script>

<template>
  <div relative>
    <img src="/lamp.png" alt="Lamp">
    <div absolute inset-0 flex py10 of-hidden>
      <div leading-1em uppercase font-type2 font-800 text-center text-2xl write-vertical-right ma ws-pre-wrap break-after-auto of-hidden>
        {{ sponsor?.sponsor.name }}
      </div>
    </div>
  </div>
</template>
