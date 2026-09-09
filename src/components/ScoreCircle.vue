<script setup>
import { computed } from 'vue'

const props = defineProps({
  score:  { type: Number, required: true },
  size:   { type: Number, default: 140 },
  stroke: { type: Number, default: 12 },
})

const r         = computed(() => props.size / 2 - props.stroke)
const circ      = computed(() => 2 * Math.PI * r.value)
const offset    = computed(() => circ.value * (1 - Math.min(props.score, 100) / 100))
const color     = computed(() =>
  props.score >= 75 ? '#22c55e' : props.score >= 50 ? '#f59e0b' : '#ef4444'
)
const label     = computed(() =>
  props.score >= 75 ? 'Bon' : props.score >= 50 ? 'À améliorer' : 'Critique'
)
const cx = computed(() => props.size / 2)
const cy = computed(() => props.size / 2)
</script>

<template>
  <div class="score-circle">
    <svg :width="size" :height="size" :viewBox="`0 0 ${size} ${size}`">
      <circle :cx="cx" :cy="cy" :r="r" fill="none" stroke="#1e2939" :stroke-width="stroke" />
      <circle
        :cx="cx" :cy="cy" :r="r"
        fill="none"
        :stroke="color"
        :stroke-width="stroke"
        :stroke-dasharray="circ"
        :stroke-dashoffset="offset"
        stroke-linecap="round"
        :transform="`rotate(-90 ${cx} ${cy})`"
        class="arc"
      />
    </svg>
    <div class="inner">
      <span class="num" :style="{ color }">{{ score }}</span>
      <span class="denom">/100</span>
      <span v-if="$slots.label" class="lbl"><slot name="label" /></span>
      <span v-else class="lbl">{{ label }}</span>
    </div>
  </div>
</template>

<style scoped>
.score-circle { position: relative; display: inline-block; }
.arc { transition: stroke-dashoffset 1s ease; }
.inner {
  position: absolute; inset: 0;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  pointer-events: none;
}
.num   { font-size: 2.2rem; font-weight: 800; line-height: 1; }
.denom { font-size: .65rem; color: #64748b; text-transform: uppercase; letter-spacing: .06em; }
.lbl   { font-size: .7rem;  color: #94a3b8; margin-top: 2px; }
</style>
