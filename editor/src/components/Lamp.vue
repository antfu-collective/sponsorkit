<script setup lang="ts">
import { nextTick } from 'vue'
import type { Sponsorship } from '../../../src/types'
import { onMounted, ref, useTemplateRef } from 'vue'

const props = defineProps<{
  sponsor?: Sponsorship
}>()

const text = useTemplateRef('text')
const lamp = useTemplateRef('lamp')
const scale = ref(1)

onMounted(async () => {
  await new Promise(resolve => setTimeout(resolve, 0))
  const rectText = text.value!.getBoundingClientRect()
  const rectLamp = lamp.value!.getBoundingClientRect()

  const scaleX = (rectLamp.width - 20) / rectText.width 
  const scaleY = (rectLamp.height - 80) / rectText.height
  
  scale.value = Math.min(scaleX, scaleY)
})
</script>

<template>
  <div relative>
    <img src="/lamp.png" alt="Lamp">
    <div ref="lamp" absolute inset-0 flex of-hidden py10>
      <div
        ref="text" relative h-fit w-fit
        ma break-after-auto of-hidden ws-pre-wrap text-center text-2xl leading-1em font-type2 uppercase write-vertical-right
        :style="{ transform: `scale(${scale})`, transformOrigin: 'center center' }"
      >
        {{ sponsor?.sponsor.name || sponsor?.sponsor.login }}
      </div>
    </div>
  </div>
</template>
