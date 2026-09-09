<script setup>
import { ref } from 'vue'
import ScoreCircle from './ScoreCircle.vue'
import GroupCard from './GroupCard.vue'

defineProps({
  page: { type: Object, required: true },
})

const open = ref(false)
const scoreColor = (s) => s >= 75 ? '#22c55e' : s >= 50 ? '#f59e0b' : '#ef4444'
</script>

<template>
  <div class="card">
    <!-- Header -->
    <div class="card-header" @click="open = !open">
      <div class="page-info">
        <h2 class="page-name">{{ page.name }}</h2>
        <a :href="page.url" target="_blank" class="page-url" @click.stop>{{ page.url }}</a>
      </div>

      <!-- Mini group scores -->
      <div class="group-scores">
        <div v-for="g in page.groups" :key="g.id" class="mini-score">
          <span class="mini-icon">{{ g.icon }}</span>
          <span class="mini-val" :style="{ color: scoreColor(g.score) }">{{ g.score }}</span>
        </div>
      </div>

      <ScoreCircle :score="page.score" :size="80" :stroke="8" />

      <span class="chevron" :class="{ rotated: open }">▾</span>
    </div>

    <!-- Details -->
    <Transition name="slide">
      <div v-if="open" class="card-body">
        <GroupCard v-for="g in page.groups" :key="g.id" :group="g" />
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.card {
  background: #162032; border: 1px solid #253347;
  border-radius: 16px; margin-bottom: 16px; overflow: hidden;
}
.card-header {
  display: flex; align-items: center; gap: 16px; padding: 20px 24px;
  cursor: pointer; user-select: none;
  transition: background .15s;
}
.card-header:hover { background: rgba(255,255,255,.02); }
.page-info { flex: 1; min-width: 0; }
.page-name { margin: 0 0 3px; font-size: 1.05rem; font-weight: 700; color: #e2e8f0; }
.page-url  { font-size: .78rem; color: #60a5fa; text-decoration: none; }
.page-url:hover { text-decoration: underline; }

.group-scores {
  display: flex; gap: 16px; flex-shrink: 0;
}
.mini-score {
  display: flex; flex-direction: column; align-items: center; gap: 2px;
}
.mini-icon { font-size: .8rem; }
.mini-val  { font-size: .8rem; font-weight: 700; }

.chevron { font-size: 1.2rem; color: #475569; transition: transform .25s; flex-shrink: 0; }
.chevron.rotated { transform: rotate(180deg); }

.card-body { padding: 0 24px 24px; border-top: 1px solid #1e2939; padding-top: 20px; }

/* Transition */
.slide-enter-active, .slide-leave-active { transition: all .25s ease; overflow: hidden; }
.slide-enter-from, .slide-leave-to { opacity: 0; max-height: 0; padding-top: 0; padding-bottom: 0; }
.slide-enter-to, .slide-leave-from { opacity: 1; max-height: 2000px; }
</style>
