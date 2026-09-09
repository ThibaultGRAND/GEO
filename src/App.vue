<script setup>
import { computed } from 'vue'
import { useAuditStore } from './stores/audit.js'
import ScoreCircle from './components/ScoreCircle.vue'
import PageCard from './components/PageCard.vue'

const audit = useAuditStore()

const progressPct = computed(() => {
  if (!audit.progress.total) return 0
  return Math.round((audit.progress.index / audit.progress.total) * 100)
})

const scoreColor = (s) => s >= 75 ? '#22c55e' : s >= 50 ? '#f59e0b' : '#ef4444'

const formattedDate = computed(() => {
  if (!audit.auditedAt) return ''
  return new Date(audit.auditedAt).toLocaleDateString('fr-FR', {
    day: '2-digit', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
})
</script>

<template>
  <div class="app">
    <!-- ── Header ── -->
    <header class="header">
      <div class="header-inner">
        <div class="brand">
          <span class="brand-icon">🔍</span>
          <div>
            <div class="brand-name">Vizion Academy</div>
            <div class="brand-sub">Audit SEO / GEO</div>
          </div>
        </div>
        <button
          class="btn-run"
          :disabled="audit.isRunning"
          @click="audit.status === 'idle' || audit.status === 'error' ? audit.runAudit() : null"
        >
          <span v-if="audit.isRunning" class="spinner" />
          <span v-else>▶ Lancer l'audit</span>
        </button>
      </div>
    </header>

    <main class="main">

      <!-- ── IDLE ── -->
      <div v-if="audit.status === 'idle'" class="empty">
        <div class="empty-icon">🎯</div>
        <h2 class="empty-title">Prêt à analyser vizionacademy.fr</h2>
        <p class="empty-desc">
          L'audit vérifie {{ 5 }} pages sur les critères SEO et GEO :<br>
          méta, données structurées, contenu, images, performance.
        </p>
        <button class="btn-run btn-run--lg" @click="audit.runAudit()">
          ▶ Lancer l'audit
        </button>
      </div>

      <!-- ── RUNNING ── -->
      <div v-else-if="audit.isRunning" class="running">
        <div class="running-header">
          <div class="spinner-lg" />
          <div>
            <div class="running-msg">{{ audit.progress.message }}</div>
            <div class="running-sub">Page {{ audit.progress.index + 1 }} / {{ audit.progress.total }}</div>
          </div>
        </div>
        <div class="progress-bar">
          <div class="progress-fill" :style="{ width: progressPct + '%' }" />
        </div>
        <!-- Pages déjà auditées en temps réel -->
        <div v-if="audit.results.length" class="live-results">
          <PageCard v-for="p in audit.results" :key="p.url" :page="p" />
        </div>
      </div>

      <!-- ── ERROR ── -->
      <div v-else-if="audit.status === 'error'" class="error-box">
        <div class="error-icon">❌</div>
        <div class="error-title">Erreur d'audit</div>
        <div class="error-msg">{{ audit.errorMsg }}</div>
        <button class="btn-run" @click="audit.reset()">Réessayer</button>
      </div>

      <!-- ── DONE ── -->
      <template v-else-if="audit.isDone">

        <!-- Score global -->
        <div class="global-section">
          <div class="global-score-block">
            <ScoreCircle :score="audit.globalScore" :size="160" :stroke="14">
              <template #label>
                {{ audit.globalScore >= 75 ? 'Bon' : audit.globalScore >= 50 ? 'À améliorer' : 'Critique' }}
              </template>
            </ScoreCircle>
            <div class="global-meta">
              <div class="global-site">vizionacademy.fr</div>
              <div class="global-date">{{ formattedDate }}</div>
              <div class="global-stats">
                <span class="stat-err">❌ {{ audit.allErrors.length }} erreurs</span>
                <span class="stat-warn">⚠️ {{ audit.allWarnings.length }} avertissements</span>
              </div>
            </div>
          </div>

          <!-- Cards par page -->
          <div class="summary-cards">
            <div
              v-for="p in audit.results"
              :key="p.url"
              class="summary-card"
              :style="{ borderColor: scoreColor(p.score) + '44' }"
            >
              <div class="summary-score" :style="{ color: scoreColor(p.score) }">{{ p.score }}</div>
              <div class="summary-denom">/100</div>
              <div class="summary-name">{{ p.name }}</div>
            </div>
          </div>
        </div>

        <!-- Recommandations -->
        <section class="section">
          <h2 class="section-title">
            Recommandations prioritaires
            <span class="count-badge">{{ audit.allErrors.length + audit.allWarnings.length }}</span>
          </h2>
          <ul class="reco-list">
            <li v-for="c in audit.allErrors" :key="c.page + c.label" class="reco-item">
              <span class="reco-icon">❌</span>
              <div>
                <span class="reco-page reco-page--err">{{ c.page }}</span>
                <strong class="reco-label">{{ c.label }}</strong>
                <span class="reco-detail"> — {{ c.detail }}</span>
              </div>
            </li>
            <li v-for="c in audit.allWarnings" :key="c.page + c.label" class="reco-item">
              <span class="reco-icon">⚠️</span>
              <div>
                <span class="reco-page reco-page--warn">{{ c.page }}</span>
                <strong class="reco-label">{{ c.label }}</strong>
                <span class="reco-detail"> — {{ c.detail }}</span>
              </div>
            </li>
            <li v-if="!audit.allErrors.length && !audit.allWarnings.length" class="reco-empty">
              🎉 Aucun problème détecté !
            </li>
          </ul>
        </section>

        <!-- Détail par page -->
        <section class="section">
          <div class="section-header">
            <h2 class="section-title">Détail par page</h2>
            <button class="btn-rerun" @click="audit.runAudit()">↻ Relancer</button>
          </div>
          <PageCard v-for="p in audit.results" :key="p.url" :page="p" />
        </section>

      </template>

    </main>
  </div>
</template>

<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: #0d1520; color: #e2e8f0; min-height: 100vh;
}

a { color: #60a5fa; }
</style>

<style scoped>
/* ── Layout ── */
.app { min-height: 100vh; display: flex; flex-direction: column; }

/* ── Header ── */
.header {
  background: #0d1520; border-bottom: 1px solid #1e2939;
  position: sticky; top: 0; z-index: 10;
}
.header-inner {
  max-width: 1100px; margin: 0 auto; padding: 14px 24px;
  display: flex; align-items: center; justify-content: space-between;
}
.brand { display: flex; align-items: center; gap: 12px; }
.brand-icon { font-size: 1.5rem; }
.brand-name { font-size: 1rem; font-weight: 700; color: #e2e8f0; }
.brand-sub  { font-size: .72rem; color: #64748b; text-transform: uppercase; letter-spacing: .07em; }

/* ── Buttons ── */
.btn-run {
  background: #2563eb; color: white; border: none; border-radius: 8px;
  padding: 10px 20px; font-size: .9rem; font-weight: 600; cursor: pointer;
  display: flex; align-items: center; gap: 8px; transition: background .2s;
}
.btn-run:hover:not(:disabled) { background: #1d4ed8; }
.btn-run:disabled { background: #1e3a5f; color: #475569; cursor: not-allowed; }
.btn-run--lg { padding: 14px 32px; font-size: 1rem; margin-top: 20px; }
.btn-rerun {
  background: transparent; color: #60a5fa; border: 1px solid #253347;
  border-radius: 8px; padding: 6px 14px; font-size: .85rem; cursor: pointer;
  transition: background .15s;
}
.btn-rerun:hover { background: #1e2939; }

/* ── Main ── */
.main { max-width: 1100px; margin: 0 auto; padding: 40px 24px; width: 100%; }

/* ── Empty ── */
.empty { text-align: center; padding: 80px 24px; }
.empty-icon  { font-size: 3rem; margin-bottom: 16px; }
.empty-title { font-size: 1.5rem; font-weight: 700; margin-bottom: 12px; }
.empty-desc  { color: #94a3b8; line-height: 1.6; }

/* ── Running ── */
.running-header { display: flex; align-items: center; gap: 16px; margin-bottom: 20px; }
.running-msg    { font-size: 1rem; font-weight: 600; color: #e2e8f0; }
.running-sub    { font-size: .85rem; color: #64748b; margin-top: 3px; }
.progress-bar   { background: #1e2939; border-radius: 100px; height: 6px; margin-bottom: 32px; }
.progress-fill  { background: #2563eb; height: 100%; border-radius: 100px; transition: width .4s ease; }
.live-results   { margin-top: 8px; }

/* ── Error ── */
.error-box {
  text-align: center; padding: 60px 24px;
  background: #1a0e0e; border: 1px solid #7f1d1d;
  border-radius: 16px;
}
.error-icon  { font-size: 2.5rem; margin-bottom: 12px; }
.error-title { font-size: 1.2rem; font-weight: 700; color: #fca5a5; margin-bottom: 8px; }
.error-msg   { color: #94a3b8; font-size: .9rem; margin-bottom: 20px; line-height: 1.5; }

/* ── Global section ── */
.global-section {
  background: linear-gradient(135deg, #1b3a5c, #0d1520);
  border: 1px solid #253347; border-radius: 20px;
  padding: 36px; margin-bottom: 36px;
}
.global-score-block {
  display: flex; align-items: center; gap: 28px; margin-bottom: 28px;
  flex-wrap: wrap;
}
.global-meta   { flex: 1; }
.global-site   { font-size: 1.3rem; font-weight: 700; color: #e2e8f0; margin-bottom: 4px; }
.global-date   { font-size: .83rem; color: #64748b; margin-bottom: 12px; }
.global-stats  { display: flex; gap: 16px; flex-wrap: wrap; }
.stat-err  { color: #ef4444; font-size: .85rem; font-weight: 600; }
.stat-warn { color: #f59e0b; font-size: .85rem; font-weight: 600; }

.summary-cards {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px;
}
.summary-card {
  background: #0d1520; border: 1px solid #253347; border-radius: 12px;
  padding: 16px; text-align: center;
}
.summary-score { font-size: 2rem; font-weight: 800; line-height: 1; }
.summary-denom { font-size: .65rem; color: #64748b; text-transform: uppercase; letter-spacing: .06em; }
.summary-name  { font-size: .85rem; font-weight: 600; color: #e2e8f0; margin-top: 8px; }

/* ── Sections ── */
.section { margin-bottom: 40px; }
.section-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
.section-title  { font-size: 1.05rem; font-weight: 700; color: #e2e8f0; margin-bottom: 20px; }
.section-header .section-title { margin-bottom: 0; }
.count-badge {
  display: inline-block; margin-left: 10px;
  background: #253347; color: #94a3b8;
  padding: 2px 10px; border-radius: 20px; font-size: .73rem; font-weight: 600;
}

/* ── Recommendations ── */
.reco-list  { list-style: none; background: #162032; border: 1px solid #253347; border-radius: 16px; padding: 8px 20px; }
.reco-item  { display: flex; gap: 12px; align-items: flex-start; padding: 12px 0; border-bottom: 1px solid #1e2939; }
.reco-item:last-child { border-bottom: none; }
.reco-icon  { flex-shrink: 0; font-size: .95rem; margin-top: 1px; }
.reco-page  { font-size: .75rem; font-weight: 700; margin-right: 6px; }
.reco-page--err  { color: #ef4444; }
.reco-page--warn { color: #f59e0b; }
.reco-label  { color: #e2e8f0; }
.reco-detail { color: #94a3b8; font-size: .85rem; }
.reco-empty  { color: #64748b; padding: 16px 0; }

/* ── Spinners ── */
.spinner {
  width: 16px; height: 16px; border: 2px solid #475569;
  border-top-color: #fff; border-radius: 50%; animation: spin .7s linear infinite;
}
.spinner-lg {
  width: 32px; height: 32px; border: 3px solid #1e2939;
  border-top-color: #2563eb; border-radius: 50%; animation: spin .8s linear infinite;
  flex-shrink: 0;
}
@keyframes spin { to { transform: rotate(360deg); } }
</style>
