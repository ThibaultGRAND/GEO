<script setup>
defineProps({
  criterion: { type: Object, required: true },
})

const icons = { ok: '✅', warning: '⚠️', error: '❌' }
const bgs   = {
  ok:      'transparent',
  warning: 'rgba(245,158,11,.07)',
  error:   'rgba(239,68,68,.07)',
}
</script>

<template>
  <tr :style="{ background: bgs[criterion.status] }" class="row">
    <td class="icon-cell">{{ icons[criterion.status] }}</td>
    <td class="label-cell">{{ criterion.label }}</td>
    <td class="detail-cell">{{ criterion.detail }}</td>
    <td v-if="criterion.value" class="value-cell" :title="criterion.value">{{ criterion.value }}</td>
    <td v-else></td>
  </tr>
</template>

<style scoped>
.row { transition: background .15s; }
.row:hover td { background: rgba(255,255,255,.025) !important; }
td { padding: 9px 14px; font-size: .875rem; }
.icon-cell   { text-align: center; width: 40px; }
.label-cell  { font-weight: 500; white-space: nowrap; color: #e2e8f0; }
.detail-cell { color: #94a3b8; }
.value-cell  { color: #64748b; font-size: .78rem; max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
