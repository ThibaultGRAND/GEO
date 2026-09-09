<script setup>
import CriterionRow from './CriterionRow.vue'

defineProps({
  group: { type: Object, required: true },
})

const scoreColor = (s) => s >= 75 ? '#22c55e' : s >= 50 ? '#f59e0b' : '#ef4444'
</script>

<template>
  <div class="group">
    <div class="group-header">
      <span class="icon">{{ group.icon }}</span>
      <h3 class="name">{{ group.name }}</h3>
      <div class="badge" :style="{ background: scoreColor(group.score) }">
        {{ group.score }}/100
      </div>
    </div>
    <table class="table">
      <thead>
        <tr>
          <th></th>
          <th>Critère</th>
          <th>Détail</th>
          <th>Valeur</th>
        </tr>
      </thead>
      <tbody>
        <CriterionRow v-for="c in group.criteria" :key="c.label" :criterion="c" />
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.group { margin-bottom: 20px; }
.group-header {
  display: flex; align-items: center; gap: 10px; margin-bottom: 10px;
}
.icon  { font-size: 1.1rem; }
.name  { margin: 0; font-size: .95rem; font-weight: 600; color: #e2e8f0; flex: 1; }
.badge {
  color: #fff; padding: 2px 10px; border-radius: 20px;
  font-size: .73rem; font-weight: 700;
}
.table {
  width: 100%; border-collapse: collapse;
  background: #1a2738; border-radius: 8px; overflow: hidden;
  font-size: .875rem;
}
.table thead tr {
  background: #253347; color: #94a3b8;
  font-size: .7rem; text-transform: uppercase; letter-spacing: .05em;
}
.table thead th { padding: 6px 14px; text-align: left; }
</style>
