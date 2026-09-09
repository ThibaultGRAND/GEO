import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useAuditStore = defineStore('audit', () => {
  const status      = ref('idle')   // idle | running | done | error
  const progress    = ref({ index: 0, total: 0, message: '' })
  const results     = ref([])
  const globalScore = ref(null)
  const auditedAt   = ref(null)
  const errorMsg    = ref(null)

  const isRunning = computed(() => status.value === 'running')
  const isDone    = computed(() => status.value === 'done')

  const allErrors   = computed(() =>
    results.value.flatMap(r =>
      r.groups.flatMap(g => g.criteria.filter(c => c.status === 'error').map(c => ({ page: r.name, ...c })))
    )
  )
  const allWarnings = computed(() =>
    results.value.flatMap(r =>
      r.groups.flatMap(g => g.criteria.filter(c => c.status === 'warning').map(c => ({ page: r.name, ...c })))
    )
  )

  async function runAudit() {
    status.value      = 'running'
    results.value     = []
    globalScore.value = null
    errorMsg.value    = null
    progress.value    = { index: 0, total: 0, message: 'Connexion au serveur…' }

    const es = new EventSource('/api/audit')

    es.onmessage = (e) => {
      const data = JSON.parse(e.data)

      if (data.type === 'start') {
        progress.value.total = data.total
      }
      else if (data.type === 'progress') {
        progress.value = { ...progress.value, index: data.index, message: data.message }
      }
      else if (data.type === 'page') {
        results.value = [...results.value, data.result]
      }
      else if (data.type === 'done') {
        globalScore.value = data.globalScore
        results.value     = data.results
        auditedAt.value   = data.auditedAt
        status.value      = 'done'
        es.close()
      }
      else if (data.type === 'error') {
        errorMsg.value = data.message
        status.value   = 'error'
        es.close()
      }
    }

    es.onerror = () => {
      errorMsg.value = 'Impossible de contacter le serveur d\'audit. Vérifiez que `npm run server` est lancé.'
      status.value   = 'error'
      es.close()
    }
  }

  function reset() {
    status.value      = 'idle'
    results.value     = []
    globalScore.value = null
    errorMsg.value    = null
    auditedAt.value   = null
  }

  return { status, progress, results, globalScore, auditedAt, errorMsg, isRunning, isDone, allErrors, allWarnings, runAudit, reset }
})
