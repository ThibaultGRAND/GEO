#!/usr/bin/env node
/**
 * SEO / GEO Audit — Vizion Academy
 *
 * Usage :
 *   1. npm install puppeteer --save-dev   (une seule fois)
 *   2. npm run audit
 *   3. Ouvrir scripts/seo-report.html dans le navigateur
 */

import puppeteer from 'puppeteer'
import { writeFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ─────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────

const SITE = 'https://vizionacademy.fr'
const OUTPUT = path.join(__dirname, 'seo-report.html')
const TIMEOUT = 30_000
const RENDER_WAIT = 1_500 // délai pour que Vue finisse de rendre

const PAGES = [
  { name: 'Accueil',             path: '/',                   type: 'home', minWords: 400 },
  { name: 'Espace Écoles',       path: '/espaceecoles',       type: 'page', minWords: 600 },
  { name: 'Espace Intervenants', path: '/espaceintervenants', type: 'page', minWords: 600 },
  { name: 'Challenges',          path: '/challenges',         type: 'page', minWords: 400 },
  { name: 'Contact',             path: '/contact',            type: 'page', minWords: 150 },
]

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

const ok      = (label, detail = '', value = '') => ({ status: 'ok',      label, detail, value })
const warn    = (label, detail = '', value = '') => ({ status: 'warning', label, detail, value })
const err     = (label, detail = '', value = '') => ({ status: 'error',   label, detail, value })
const pts     = (c) => c.status === 'ok' ? 1 : c.status === 'warning' ? 0.5 : 0
const score   = (criteria) => Math.round(criteria.reduce((a, c) => a + pts(c), 0) / criteria.length * 100)
const clamp   = (v, min, max) => Math.min(Math.max(v, min), max)
const sleep   = (ms) => new Promise(r => setTimeout(r, ms))

// ─────────────────────────────────────────────────────────────
// Checks — Meta & Indexation
// ─────────────────────────────────────────────────────────────

async function checkTitle(page) {
  const t = await page.title()
  if (!t) return err('Balise <title>', 'Absente')
  const l = t.length
  if (l < 30) return err('Balise <title>', `Trop courte — ${l} car. (min 50)`, t)
  if (l > 70) return warn('Balise <title>', `Trop longue — ${l} car. (max 60)`, t)
  return ok('Balise <title>', `${l} caractères ✓`, t)
}

async function checkMetaDesc(page) {
  const d = await page.$eval('meta[name="description"]', el => el.content).catch(() => null)
  if (!d) return err('Meta description', 'Absente')
  const l = d.length
  if (l < 100) return warn('Meta description', `Trop courte — ${l} car. (min 140)`, d)
  if (l > 165) return warn('Meta description', `Trop longue — ${l} car. (max 160)`, d)
  return ok('Meta description', `${l} caractères ✓`, d)
}

async function checkCanonical(page) {
  const c = await page.$eval('link[rel="canonical"]', el => el.href).catch(() => null)
  if (!c) return err('Canonical', 'Balise canonical absente')
  return ok('Canonical', c)
}

async function checkViewport(page) {
  const v = await page.$eval('meta[name="viewport"]', el => el.content).catch(() => null)
  if (!v) return err('Viewport meta', 'Absente — page non mobile-friendly')
  if (!v.includes('width=device-width')) return warn('Viewport meta', `Valeur incorrecte : ${v}`)
  return ok('Viewport meta', v)
}

async function checkOpenGraph(page) {
  const [title, desc, image, url, type] = await page.evaluate(() => {
    const g = (n) => document.querySelector(`meta[property="${n}"]`)?.content ?? ''
    return [g('og:title'), g('og:description'), g('og:image'), g('og:url'), g('og:type')]
  })
  const missing = [['og:title', title], ['og:description', desc], ['og:image', image], ['og:url', url]]
    .filter(([, v]) => !v).map(([k]) => k)
  if (missing.length === 0) return ok('Open Graph', 'og:title, og:description, og:image, og:url ✓')
  if (missing.length <= 2)  return warn('Open Graph', `Incomplet — manque : ${missing.join(', ')}`)
  return err('Open Graph', `Manque : ${missing.join(', ')}`)
}

async function checkTwitterCard(page) {
  const card = await page.$eval('meta[name="twitter:card"]', el => el.content).catch(() => null)
  if (!card) return err('Twitter Card', 'Absente')
  return ok('Twitter Card', card)
}

async function checkHreflang(page) {
  const langs = await page.$$eval('link[rel="alternate"][hreflang]', els => els.map(el => el.hreflang))
  if (langs.length === 0) return warn('hreflang', 'Aucune balise hreflang détectée')
  return ok('hreflang', langs.join(', '))
}

// ─────────────────────────────────────────────────────────────
// Checks — Données structurées
// ─────────────────────────────────────────────────────────────

async function checkJSONLD(page) {
  const schemas = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
      .map(s => { try { return JSON.parse(s.textContent) } catch { return null } })
      .filter(Boolean)
  })

  if (schemas.length === 0) return {
    jsonLd:       err('JSON-LD présent',                 'Aucun schema.org détecté sur cette page'),
    orgSchema:    err('Schema Organization',             'Absent'),
    webpageSchema:err('Schema WebPage / Service',        'Absent — ajouter WebPage ou Service'),
    faqSchema:    err('Schema FAQPage',                  'Absent — ajouter un FAQPage JSON-LD'),
    dateSchema:   err('datePublished / dateModified',    'Absent dans les schemas'),
    schemaTypes:  err('Variété des schemas',             'Aucun schema — ajouter au moins 3 types'),
  }

  const flat = schemas.flatMap(s => s['@graph'] ?? [s])
  const types = flat.map(s => s['@type']).filter(Boolean)

  const has = (...t) => t.some(type => types.includes(type))

  return {
    jsonLd: ok('JSON-LD présent', `${schemas.length} bloc(s) · types : ${types.join(', ')}`),
    orgSchema: has('Organization')
      ? ok('Schema Organization', 'Présent ✓')
      : warn('Schema Organization', 'Absent sur cette page'),
    webpageSchema: has('WebPage', 'Service', 'EducationalOccupationalProgram', 'ItemList', 'ProfilePage')
      ? ok('Schema WebPage / Service', `Présent : ${types.filter(t => ['WebPage','Service','EducationalOccupationalProgram','ItemList','ProfilePage'].includes(t)).join(', ')}`)
      : err('Schema WebPage / Service', 'Absent — ajouter WebPage ou Service JSON-LD'),
    faqSchema: has('FAQPage')
      ? ok('Schema FAQPage', 'Présent ✓')
      : err('Schema FAQPage', 'Absent — ajouter FAQPage avec 4–5 questions'),
    dateSchema: flat.some(s => s.datePublished || s.dateModified)
      ? ok('datePublished / dateModified', 'Présent dans les schemas ✓')
      : err('datePublished / dateModified', 'Absent — les IA favorisent les contenus datés'),
    schemaTypes: types.length >= 3
      ? ok('Variété des schemas', `${types.length} types ✓`)
      : warn('Variété des schemas', `Seulement ${types.length} type(s) — viser 3+ (WebPage, Service, FAQPage, Org…)`),
  }
}

// ─────────────────────────────────────────────────────────────
// Checks — Qualité du contenu
// ─────────────────────────────────────────────────────────────

async function getBodyText(page) {
  return page.evaluate(() => {
    const clone = document.body.cloneNode(true)
    clone.querySelectorAll('nav, footer, header, script, style, noscript, [aria-hidden="true"]')
      .forEach(el => el.remove())
    return (clone.innerText ?? '').trim()
  })
}

async function checkH1(page) {
  const h1s = await page.$$eval('h1', els => els.map(el => el.innerText.trim()))
  if (h1s.length === 0) return err('Balise H1', 'Absente')
  if (h1s.length > 1)   return warn('Balise H1', `${h1s.length} H1 détectés — 1 seul recommandé`, h1s.join(' | '))
  return ok('Balise H1', 'Présente et unique', h1s[0])
}

async function checkHeadings(page) {
  const h2 = await page.$$eval('h2', els => els.length)
  const h3 = await page.$$eval('h3', els => els.length)
  if (h2 === 0) return err('Structure H2/H3', 'Aucun H2 — structurer la page avec des sous-titres')
  if (h2 < 2)   return warn('Structure H2/H3', `${h2} H2, ${h3} H3 — ajouter des sous-titres`)
  return ok('Structure H2/H3', `${h2} H2, ${h3} H3`)
}

async function checkQuestionsInTitles(page) {
  const headings = await page.$$eval('h1,h2,h3', els => els.map(el => el.innerText.trim()))
  const questions = headings.filter(h => h.includes('?') || /^(Comment|Pourquoi|Qu[eé]l?|Est-ce|Combien)/i.test(h))
  if (questions.length === 0) return err('Questions dans les titres', 'Aucun titre interrogatif — ajouter des H2/H3 sous forme de questions')
  return ok('Questions dans les titres', `${questions.length} titre(s) interrogatif(s)`, questions.slice(0, 3).join(' | '))
}

async function checkWordCount(page, minWords) {
  const text = await getBodyText(page)
  const count = text.split(/\s+/).filter(w => w.length > 1).length
  if (count < minWords * 0.5) return err('Nombre de mots',  `${count} mots — objectif ${minWords}+`)
  if (count < minWords)       return warn('Nombre de mots', `${count} mots — objectif ${minWords}+`)
  return ok('Nombre de mots', `${count} mots ✓`)
}

async function checkSentenceLength(page) {
  const text = await getBodyText(page)
  const sentences = text.split(/[.!?]+/).map(s => s.trim()).filter(s => s.split(/\s+/).length >= 3)
  if (sentences.length < 5) return warn('Longueur des phrases', 'Pas assez de contenu pour mesurer')
  const avg = Math.round(sentences.reduce((a, s) => a + s.split(/\s+/).length, 0) / sentences.length)
  if (avg < 8)  return err('Longueur des phrases',  `${avg} mots/phrase — trop court, objectif 10–25`)
  if (avg > 30) return warn('Longueur des phrases', `${avg} mots/phrase — trop long (max 25)`)
  return ok('Longueur des phrases', `${avg} mots/phrase en moyenne ✓`)
}

async function checkStatistics(page) {
  const text = await getBodyText(page)
  const matches = (text.match(/\b\d[\d\s]*(%|k\b|K\b|€|\$|étudiants?|experts?|écoles?|partenaires?|missions?|challenges?|ans?)\b/gi) ?? [])
  if (matches.length === 0)  return err('Chiffres / statistiques',  'Aucun chiffre clé — ajouter des données concrètes')
  if (matches.length < 3)    return warn('Chiffres / statistiques', `${matches.length} chiffre(s) — viser 3+`, matches.join(', '))
  return ok('Chiffres / statistiques', `${matches.length} donnée(s) chiffrée(s)`, matches.slice(0, 5).join(', '))
}

async function checkExternalLinks(page) {
  const links = await page.$$eval('a[href]', els =>
    els.map(el => el.href).filter(h => h.startsWith('http') && !h.includes('vizionacademy.fr'))
  )
  if (links.length === 0) return err('Liens externes', 'Aucun lien vers une source externe — ajouter 1–2 citations')
  return ok('Liens externes', `${links.length} lien(s) externe(s)`, links.slice(0, 2).join(', '))
}

async function checkFAQVisible(page) {
  const hasDetails = await page.$$eval('details', els => els.length)
  const text = (await getBodyText(page)).toLowerCase()
  const hasFAQ = ['faq', 'questions fréquentes', 'foire aux questions', 'questions courantes'].some(kw => text.includes(kw))
  if (!hasFAQ && hasDetails === 0) return err('Section FAQ visible', 'Aucune section FAQ visible dans la page')
  return ok('Section FAQ visible', hasDetails > 0 ? `${hasDetails} bloc(s) <details>` : 'Section FAQ détectée')
}

async function checkTimeTag(page) {
  const count = await page.$$eval('time', els => els.length)
  if (count === 0) return err('Balise <time>', 'Absente — ajouter une date de mise à jour visible')
  const dates = await page.$$eval('time', els => els.map(el => el.getAttribute('datetime') ?? el.innerText))
  return ok('Balise <time>', `${count} balise(s)`, dates.join(', '))
}

// ─────────────────────────────────────────────────────────────
// Checks — Images & Performance
// ─────────────────────────────────────────────────────────────

async function checkImages(page) {
  const imgs = await page.$$eval('img', els => els.map(el => ({
    alt:      el.getAttribute('alt'),
    srcset:   el.hasAttribute('srcset'),
    loading:  el.getAttribute('loading'),
    src:      el.src,
  })))

  if (imgs.length === 0) return [
    ok('Alt images',   'Aucune image détectée'),
    ok('srcset',       'Aucune image détectée'),
    ok('Lazy loading', 'Aucune image détectée'),
  ]

  const n = imgs.length
  const withAlt    = imgs.filter(i => i.alt !== null).length
  const withSrcset = imgs.filter(i => i.srcset).length
  const withLazy   = imgs.filter(i => i.loading === 'lazy').length
  const pct = Math.round(withAlt / n * 100)

  const altResult = pct === 100  ? ok('Alt images',   `${n}/${n} images avec alt (100%) ✓`)
                  : pct >= 80    ? warn('Alt images',  `${withAlt}/${n} avec alt (${pct}%) — objectif 100%`)
                  :                err('Alt images',   `${withAlt}/${n} avec alt (${pct}%) — critique`)

  const srcsetResult = withSrcset === 0        ? err('srcset / images responsives',  'Aucune image responsive — ajouter srcset ou <picture>')
                     : withSrcset < n * 0.5    ? warn('srcset / images responsives', `${withSrcset}/${n} images avec srcset`)
                     :                           ok('srcset / images responsives',   `${withSrcset}/${n} images avec srcset ✓`)

  const lazyResult = withLazy === 0  ? err('Lazy loading',  'Aucune image avec loading="lazy"')
                   : withLazy < n * 0.5 ? warn('Lazy loading', `${withLazy}/${n} images avec lazy loading`)
                   :                      ok('Lazy loading',   `${withLazy}/${n} images avec lazy loading ✓`)

  return [altResult, srcsetResult, lazyResult]
}

// ─────────────────────────────────────────────────────────────
// Page audit orchestrator
// ─────────────────────────────────────────────────────────────

async function auditPage(browser, cfg) {
  const url = SITE + cfg.path
  process.stdout.write(`  → ${cfg.name.padEnd(25)} `)

  const page = await browser.newPage()
  await page.setViewport({ width: 1280, height: 800 })
  await page.setUserAgent('Mozilla/5.0 (compatible; VizionAcademyAudit/1.0)')

  // Load & measure
  const t0 = Date.now()
  await page.goto(url, { waitUntil: 'networkidle2', timeout: TIMEOUT })
  const loadMs = Date.now() - t0
  await sleep(RENDER_WAIT) // wait for Vue reactivity

  const secs = (loadMs / 1000).toFixed(2)
  const loadResult = loadMs > 4000 ? err('Temps de chargement', `${secs}s — objectif < 2s`)
                   : loadMs > 2000 ? warn('Temps de chargement', `${secs}s — lent, objectif < 2s`)
                   :                  ok('Temps de chargement', `${secs}s ✓`)

  // All checks
  const [
    titleR, descR, canonR, viewR, ogR, twitterR, hreflangR,
    h1R, headingsR, questionsR, wordsR, sentR, statsR, extR, faqVisR, timeR,
    imgResults,
    jsonldR,
  ] = await Promise.all([
    checkTitle(page),
    checkMetaDesc(page),
    checkCanonical(page),
    checkViewport(page),
    checkOpenGraph(page),
    checkTwitterCard(page),
    checkHreflang(page),
    checkH1(page),
    checkHeadings(page),
    checkQuestionsInTitles(page),
    checkWordCount(page, cfg.minWords),
    checkSentenceLength(page),
    checkStatistics(page),
    checkExternalLinks(page),
    checkFAQVisible(page),
    checkTimeTag(page),
    checkImages(page),
    checkJSONLD(page),
  ])

  await page.close()

  const groups = [
    {
      name: 'Méta & Indexation',
      icon: '🏷️',
      criteria: [titleR, descR, canonR, viewR, ogR, twitterR, hreflangR],
    },
    {
      name: 'Données structurées',
      icon: '🗂️',
      criteria: [jsonldR.jsonLd, jsonldR.orgSchema, jsonldR.webpageSchema, jsonldR.faqSchema, jsonldR.dateSchema, jsonldR.schemaTypes],
    },
    {
      name: 'Qualité du contenu',
      icon: '📝',
      criteria: [h1R, headingsR, wordsR, sentR, questionsR, statsR, extR, faqVisR, timeR],
    },
    {
      name: 'Images & Performance',
      icon: '⚡',
      criteria: [...imgResults, loadResult],
    },
  ]

  const s = score(groups.flatMap(g => g.criteria))
  process.stdout.write(`${s}/100\n`)
  return { name: cfg.name, url, groups }
}

// ─────────────────────────────────────────────────────────────
// HTML Report
// ─────────────────────────────────────────────────────────────

function hex(s) {
  return s >= 75 ? '#22c55e' : s >= 50 ? '#f59e0b' : '#ef4444'
}

function buildReport(results) {
  const globalScore = Math.round(
    results.reduce((a, r) => a + score(r.groups.flatMap(g => g.criteria)), 0) / results.length
  )
  const globalColor = hex(globalScore)

  const allErrors   = results.flatMap(r => r.groups.flatMap(g => g.criteria.filter(c => c.status === 'error')  .map(c => ({ page: r.name, ...c }))))
  const allWarnings = results.flatMap(r => r.groups.flatMap(g => g.criteria.filter(c => c.status === 'warning').map(c => ({ page: r.name, ...c }))))

  const now = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
  const dashOffset = (v) => (2 * Math.PI * 70 * (1 - clamp(v, 0, 100) / 100)).toFixed(2)

  const recoRows = [
    ...allErrors.map(c =>
      `<li style="padding:12px 0;border-bottom:1px solid #1e2939;display:flex;gap:12px;align-items:flex-start">
        <span style="color:#ef4444;font-size:1rem;flex-shrink:0">❌</span>
        <div><span style="color:#ef4444;font-weight:700;font-size:0.8rem">${c.page}</span>
        <span style="margin:0 6px;color:#334155">·</span>
        <strong>${c.label}</strong>
        <span style="color:#94a3b8;font-size:0.85rem;margin-left:6px">— ${c.detail}</span></div>
      </li>`
    ),
    ...allWarnings.map(c =>
      `<li style="padding:12px 0;border-bottom:1px solid #1e2939;display:flex;gap:12px;align-items:flex-start">
        <span style="color:#f59e0b;font-size:1rem;flex-shrink:0">⚠️</span>
        <div><span style="color:#f59e0b;font-weight:700;font-size:0.8rem">${c.page}</span>
        <span style="margin:0 6px;color:#334155">·</span>
        <strong>${c.label}</strong>
        <span style="color:#94a3b8;font-size:0.85rem;margin-left:6px">— ${c.detail}</span></div>
      </li>`
    ),
  ].join('')

  const summaryCards = results.map(r => {
    const s = score(r.groups.flatMap(g => g.criteria))
    return `
    <div style="background:#162032;border:1px solid #253347;border-radius:12px;padding:20px;text-align:center">
      <div style="font-size:2rem;font-weight:800;color:${hex(s)}">${s}</div>
      <div style="font-size:0.7rem;color:#64748b;text-transform:uppercase;letter-spacing:.05em">/100</div>
      <div style="font-size:0.9rem;font-weight:600;color:#e2e8f0;margin-top:8px">${r.name}</div>
      <a href="${r.url}" target="_blank" style="font-size:0.75rem;color:#60a5fa;text-decoration:none">${r.url}</a>
    </div>`
  }).join('')

  const pageDetails = results.map(r => {
    const s = score(r.groups.flatMap(g => g.criteria))
    const groupsHtml = r.groups.map(g => {
      const gs = score(g.criteria)
      const rows = g.criteria.map(c => {
        const icon = c.status === 'ok' ? '✅' : c.status === 'warning' ? '⚠️' : '❌'
        const bg = c.status === 'ok' ? '' : c.status === 'warning' ? 'background:rgba(245,158,11,.07)' : 'background:rgba(239,68,68,.07)'
        const val = c.value ? `<td style="padding:8px 14px;color:#64748b;font-size:0.78rem;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${c.value.replace(/"/g, '&quot;')}">${c.value}</td>` : '<td></td>'
        return `<tr style="${bg}">
          <td style="padding:8px 14px;text-align:center">${icon}</td>
          <td style="padding:8px 14px;font-weight:500;white-space:nowrap">${c.label}</td>
          <td style="padding:8px 14px;color:#94a3b8;font-size:0.85rem">${c.detail}</td>
          ${val}
        </tr>`
      }).join('')
      return `
      <div style="margin-bottom:20px">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
          <span>${g.icon}</span>
          <h3 style="margin:0;font-size:.95rem;font-weight:600;color:#e2e8f0">${g.name}</h3>
          <div style="margin-left:auto;background:${hex(gs)};color:#fff;padding:2px 10px;border-radius:20px;font-size:.75rem;font-weight:700">${gs}/100</div>
        </div>
        <table style="width:100%;border-collapse:collapse;background:#1a2738;border-radius:8px;overflow:hidden;font-size:0.88rem">
          <thead><tr style="background:#253347;color:#94a3b8;font-size:.72rem;text-transform:uppercase;letter-spacing:.05em">
            <th style="padding:6px 14px;width:36px"></th>
            <th style="padding:6px 14px;text-align:left">Critère</th>
            <th style="padding:6px 14px;text-align:left">Détail</th>
            <th style="padding:6px 14px;text-align:left">Valeur</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`
    }).join('')

    return `
    <div style="background:#162032;border-radius:16px;padding:28px;margin-bottom:28px;border:1px solid #253347">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;flex-wrap:wrap;gap:12px">
        <div>
          <h2 style="margin:0 0 4px;font-size:1.2rem;font-weight:700;color:#e2e8f0">${r.name}</h2>
          <a href="${r.url}" target="_blank" style="color:#60a5fa;font-size:.83rem;text-decoration:none">${r.url}</a>
        </div>
        <div style="text-align:center">
          <div style="font-size:2.8rem;font-weight:800;color:${hex(s)};line-height:1">${s}</div>
          <div style="font-size:.7rem;color:#64748b;text-transform:uppercase;letter-spacing:.05em">/100</div>
        </div>
      </div>
      ${groupsHtml}
    </div>`
  }).join('')

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Rapport SEO/GEO — Vizion Academy</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
           background: #0d1520; color: #e2e8f0; min-height: 100vh; }
    .container { max-width: 1100px; margin: 0 auto; padding: 40px 24px; }
    tr { transition: background .15s; }
    tr:hover td { background: rgba(255,255,255,.025) !important; }
    a { color: #60a5fa; }
  </style>
</head>
<body>
<div class="container">

  <!-- ── Header ── -->
  <div style="text-align:center;padding:44px 32px;background:linear-gradient(135deg,#1b3a5c,#0d1520);border-radius:20px;border:1px solid #253347;margin-bottom:40px">
    <div style="font-size:.75rem;color:#60a5fa;text-transform:uppercase;letter-spacing:.12em;margin-bottom:10px">Rapport SEO / GEO</div>
    <h1 style="font-size:2rem;font-weight:800;letter-spacing:-.02em;margin-bottom:6px">Vizion Academy</h1>
    <div style="color:#64748b;margin-bottom:36px;font-size:.9rem">Généré le ${now} · ${results.length} pages auditées · ${allErrors.length} erreurs · ${allWarnings.length} avertissements</div>

    <!-- Score circle -->
    <div style="display:inline-block;position:relative;margin-bottom:12px">
      <svg width="160" height="160" viewBox="0 0 160 160">
        <circle cx="80" cy="80" r="70" fill="none" stroke="#1e2939" stroke-width="14"/>
        <circle cx="80" cy="80" r="70" fill="none" stroke="${globalColor}" stroke-width="14"
          stroke-dasharray="${(2 * Math.PI * 70).toFixed(2)}"
          stroke-dashoffset="${dashOffset(globalScore)}"
          stroke-linecap="round"
          transform="rotate(-90 80 80)"
          style="transition:stroke-dashoffset 1s ease"/>
      </svg>
      <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center">
        <div style="font-size:3rem;font-weight:800;color:${globalColor};line-height:1">${globalScore}</div>
        <div style="font-size:.65rem;color:#64748b;text-transform:uppercase;letter-spacing:.08em">/100</div>
      </div>
    </div>
    <div style="color:#94a3b8;font-size:.9rem">
      Score global —
      <span style="color:${globalColor};font-weight:700">
        ${globalScore >= 75 ? 'Bon' : globalScore >= 50 ? 'À améliorer' : 'Critique'}
      </span>
    </div>
  </div>

  <!-- ── Summary cards ── -->
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px;margin-bottom:40px">
    ${summaryCards}
  </div>

  <!-- ── Recommendations ── -->
  <div style="background:#162032;border:1px solid #253347;border-radius:16px;padding:28px;margin-bottom:48px">
    <h2 style="font-size:1.05rem;font-weight:700;color:#e2e8f0;margin-bottom:20px">
      Recommandations prioritaires
      <span style="margin-left:10px;background:#253347;color:#94a3b8;padding:2px 10px;border-radius:20px;font-size:.75rem;font-weight:600">${allErrors.length + allWarnings.length}</span>
    </h2>
    <ul style="list-style:none">${recoRows || '<li style="color:#64748b;padding:12px 0">Aucun problème détecté 🎉</li>'}</ul>
  </div>

  <!-- ── Page details ── -->
  <h2 style="font-size:1.1rem;font-weight:700;color:#e2e8f0;margin-bottom:24px">Détail par page</h2>
  ${pageDetails}

  <!-- ── Footer ── -->
  <div style="text-align:center;color:#1e3050;font-size:.8rem;padding:24px 0">
    Audit SEO/GEO local — Vizion Academy · ${now}
  </div>
</div>
</body>
</html>`
}

// ─────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🔍  Audit SEO/GEO — Vizion Academy\n')

  let browser
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    })
  } catch {
    console.error('\n❌  Puppeteer non installé. Lancer :\n\n    npm install puppeteer --save-dev\n')
    process.exit(1)
  }

  const results = []
  for (const cfg of PAGES) {
    try {
      results.push(await auditPage(browser, cfg))
    } catch (e) {
      console.error(`  ✗ Erreur sur ${cfg.path} :`, e.message)
    }
  }

  await browser.close()

  const html = buildReport(results)
  writeFileSync(OUTPUT, html, 'utf-8')

  const g = Math.round(results.reduce((a, r) => a + score(r.groups.flatMap(g => g.criteria)), 0) / results.length)
  console.log(`\n✅  Rapport généré : ${OUTPUT}`)
  console.log(`📊  Score global   : ${g}/100\n`)
}

main().catch(e => { console.error('Fatal:', e); process.exit(1) })
