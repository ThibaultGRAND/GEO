/**
 * Serveur d'audit SEO/GEO — Vizion Academy
 * Express + Puppeteer · port 3099
 */

import express from 'express'
import puppeteer from 'puppeteer'
import { existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const IS_PROD   = process.env.NODE_ENV === 'production'
const PORT      = parseInt(process.env.PORT ?? '3099', 10)

const app = express()

// ─────────────────────────────────────────────────────────────
// Détection du navigateur (WSL → Chrome Windows en fallback)
// ─────────────────────────────────────────────────────────────

function findChrome() {
  // 1. Variable d'environnement (Docker / CI)
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    console.log(`  ✓ Chrome via env : ${process.env.PUPPETEER_EXECUTABLE_PATH}`)
    return process.env.PUPPETEER_EXECUTABLE_PATH
  }
  const candidates = [
    // Chromium Linux système (Docker Debian)
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/snap/bin/chromium',
    // Chrome Windows via WSL
    '/mnt/c/Program Files/Google/Chrome/Application/chrome.exe',
    '/mnt/c/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    // Edge Windows via WSL
    '/mnt/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  ]
  for (const p of candidates) {
    if (existsSync(p)) {
      console.log(`  ✓ Navigateur trouvé : ${p}`)
      return p
    }
  }
  return null // Puppeteer utilisera son Chrome bundled
}

const CHROME_PATH = findChrome()

// ─────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────

const SITE = 'https://vizionacademy.fr'
const TIMEOUT = 30_000
const RENDER_WAIT = 1_500

const DEFAULT_PAGES = [
  { name: 'Accueil',             path: '/',                   type: 'home', minWords: 400 },
  { name: 'Espace Écoles',       path: '/espaceecoles',       type: 'page', minWords: 600 },
  { name: 'Espace Intervenants', path: '/espaceintervenants', type: 'page', minWords: 600 },
  { name: 'Challenges',          path: '/challenges',         type: 'page', minWords: 400 },
  { name: 'Contact',             path: '/contact',            type: 'page', minWords: 150 },
]

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

const ok   = (label, detail = '', value = '') => ({ status: 'ok',      label, detail, value })
const warn = (label, detail = '', value = '') => ({ status: 'warning', label, detail, value })
const err  = (label, detail = '', value = '') => ({ status: 'error',   label, detail, value })
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

// ─────────────────────────────────────────────────────────────
// Checks — Méta & Indexation
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
  if (!v) return err('Viewport meta', 'Absente')
  if (!v.includes('width=device-width')) return warn('Viewport meta', `Valeur incorrecte : ${v}`)
  return ok('Viewport meta', v)
}

async function checkOpenGraph(page) {
  const [title, desc, image, url] = await page.evaluate(() => {
    const g = (n) => document.querySelector(`meta[property="${n}"]`)?.content ?? ''
    return [g('og:title'), g('og:description'), g('og:image'), g('og:url')]
  })
  const missing = [['og:title', title], ['og:description', desc], ['og:image', image], ['og:url', url]]
    .filter(([, v]) => !v).map(([k]) => k)
  if (missing.length === 0) return ok('Open Graph', 'og:title, og:description, og:image, og:url ✓')
  if (missing.length <= 2)  return warn('Open Graph', `Incomplet — manque : ${missing.join(', ')}`)
  return err('Open Graph', `Manque : ${missing.join(', ')}`)
}

async function checkTwitterCard(page) {
  const c = await page.$eval('meta[name="twitter:card"]', el => el.content).catch(() => null)
  if (!c) return err('Twitter Card', 'Absente')
  return ok('Twitter Card', c)
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
  const schemas = await page.evaluate(() =>
    Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
      .map(s => { try { return JSON.parse(s.textContent) } catch { return null } })
      .filter(Boolean)
  )

  if (schemas.length === 0) return {
    jsonLd:        err('JSON-LD présent',              'Aucun schema.org détecté sur cette page'),
    orgSchema:     err('Schema Organization',          'Absent'),
    webpageSchema: err('Schema WebPage / Service',     'Absent — ajouter WebPage ou Service'),
    faqSchema:     err('Schema FAQPage',               'Absent — ajouter un FAQPage JSON-LD'),
    dateSchema:    err('datePublished / dateModified', 'Absent dans les schemas'),
    schemaTypes:   err('Variété des schemas',          'Aucun schema — viser 3+ types'),
  }

  const flat  = schemas.flatMap(s => s['@graph'] ?? [s])
  const types = flat.map(s => s['@type']).filter(Boolean)
  const has   = (...t) => t.some(type => types.includes(type))

  const pageTypes = ['WebPage','Service','EducationalOccupationalProgram','ItemList','ProfilePage']

  return {
    jsonLd: ok('JSON-LD présent', `${schemas.length} bloc(s) · ${types.length} type(s)`, types.join(', ')),
    orgSchema: has('Organization')
      ? ok('Schema Organization', 'Présent ✓')
      : warn('Schema Organization', 'Absent sur cette page'),
    webpageSchema: has(...pageTypes)
      ? ok('Schema WebPage / Service', types.filter(t => pageTypes.includes(t)).join(', ') + ' ✓')
      : err('Schema WebPage / Service', 'Absent — ajouter WebPage ou Service JSON-LD'),
    faqSchema: has('FAQPage')
      ? ok('Schema FAQPage', 'Présent ✓')
      : err('Schema FAQPage', 'Absent — ajouter FAQPage avec 4–5 questions'),
    dateSchema: flat.some(s => s.datePublished || s.dateModified)
      ? ok('datePublished / dateModified', 'Présent ✓')
      : err('datePublished / dateModified', 'Absent — les IA favorisent les contenus datés'),
    schemaTypes: types.length >= 3
      ? ok('Variété des schemas', `${types.length} types ✓`, types.join(', '))
      : warn('Variété des schemas', `${types.length} type(s) seulement — viser 3+ (WebPage, Service, FAQPage…)`, types.join(', ')),
  }
}

// ─────────────────────────────────────────────────────────────
// Checks — Qualité du contenu
// ─────────────────────────────────────────────────────────────

async function getBodyText(page) {
  return page.evaluate(() => {
    const c = document.body.cloneNode(true)
    c.querySelectorAll('nav,footer,header,script,style,noscript,[aria-hidden="true"]').forEach(el => el.remove())
    return (c.innerText ?? '').trim()
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
  if (h2 === 0) return err('Structure H2/H3', 'Aucun H2 — structurer avec des sous-titres')
  if (h2 < 2)   return warn('Structure H2/H3', `${h2} H2, ${h3} H3 — ajouter plus de sous-titres`)
  return ok('Structure H2/H3', `${h2} H2, ${h3} H3`)
}

async function checkQuestionsInTitles(page) {
  const headings = await page.$$eval('h1,h2,h3', els => els.map(el => el.innerText.trim()))
  const questions = headings.filter(h => h.includes('?') || /^(Comment|Pourquoi|Qu[eé]l?|Est-ce|Combien)/i.test(h))
  if (questions.length === 0) return err('Questions dans les titres', 'Aucun titre interrogatif — ajouter des H2/H3 questions')
  return ok('Questions dans les titres', `${questions.length} titre(s) interrogatif(s)`, questions.slice(0, 3).join(' | '))
}

async function checkWordCount(page, minWords) {
  const text  = await getBodyText(page)
  const count = text.split(/\s+/).filter(w => w.length > 1).length
  if (count < minWords * 0.5) return err('Nombre de mots',  `${count} mots — objectif ${minWords}+`)
  if (count < minWords)       return warn('Nombre de mots', `${count} mots — objectif ${minWords}+`)
  return ok('Nombre de mots', `${count} mots ✓`)
}

async function checkSentenceLength(page) {
  const text      = await getBodyText(page)
  const sentences = text.split(/[.!?]+/).map(s => s.trim()).filter(s => s.split(/\s+/).length >= 3)
  if (sentences.length < 5) return warn('Longueur des phrases', 'Pas assez de contenu pour mesurer')
  const avg = Math.round(sentences.reduce((a, s) => a + s.split(/\s+/).length, 0) / sentences.length)
  if (avg < 8)  return err('Longueur des phrases',  `${avg} mots/phrase — trop court (objectif 10–25)`)
  if (avg > 30) return warn('Longueur des phrases', `${avg} mots/phrase — trop long (max 25)`)
  return ok('Longueur des phrases', `${avg} mots/phrase ✓`)
}

async function checkStatistics(page) {
  const text    = await getBodyText(page)
  const matches = text.match(/\b\d[\d\s]*(%|k\b|K\b|€|\$|étudiants?|experts?|écoles?|partenaires?|missions?|challenges?|ans?)\b/gi) ?? []
  if (matches.length === 0) return err('Chiffres / statistiques', 'Aucun chiffre clé — ajouter des données concrètes')
  if (matches.length < 3)   return warn('Chiffres / statistiques', `${matches.length} chiffre(s) — viser 3+`, matches.join(', '))
  return ok('Chiffres / statistiques', `${matches.length} donnée(s) chiffrée(s)`, matches.slice(0, 5).join(', '))
}

async function checkExternalLinks(page) {
  const links = await page.$$eval('a[href]', els =>
    els.map(el => el.href).filter(h => h.startsWith('http') && !h.includes('vizionacademy.fr'))
  )
  if (links.length === 0) return err('Liens externes', 'Aucun lien vers une source externe')
  return ok('Liens externes', `${links.length} lien(s) externe(s)`, links.slice(0, 2).join(', '))
}

async function checkFAQVisible(page) {
  const hasDetails = await page.$$eval('details', els => els.length)
  const text       = (await getBodyText(page)).toLowerCase()
  const hasFAQ     = ['faq', 'questions fréquentes', 'foire aux questions'].some(kw => text.includes(kw))
  if (!hasFAQ && hasDetails === 0) return err('Section FAQ visible', 'Aucune section FAQ visible dans la page')
  return ok('Section FAQ visible', hasDetails > 0 ? `${hasDetails} bloc(s) <details>` : 'FAQ détectée')
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
    alt:     el.getAttribute('alt'),
    srcset:  el.hasAttribute('srcset'),
    loading: el.getAttribute('loading'),
  })))

  if (imgs.length === 0) return [
    ok('Alt images',              'Aucune image détectée'),
    ok('srcset / images resp.',   'Aucune image détectée'),
    ok('Lazy loading',            'Aucune image détectée'),
  ]

  const n          = imgs.length
  const withAlt    = imgs.filter(i => i.alt !== null).length
  const withSrcset = imgs.filter(i => i.srcset).length
  const withLazy   = imgs.filter(i => i.loading === 'lazy').length
  const pct        = Math.round(withAlt / n * 100)

  return [
    pct === 100 ? ok('Alt images',             `${n}/${n} images avec alt (100%) ✓`)
    : pct >= 80 ? warn('Alt images',           `${withAlt}/${n} avec alt (${pct}%) — objectif 100%`)
    :             err('Alt images',            `${withAlt}/${n} avec alt (${pct}%) — critique`),

    withSrcset === 0    ? err('srcset / images resp.',  'Aucune image responsive — ajouter srcset')
    : withSrcset < n*.5 ? warn('srcset / images resp.', `${withSrcset}/${n} images avec srcset`)
    :                     ok('srcset / images resp.',   `${withSrcset}/${n} ✓`),

    withLazy === 0    ? err('Lazy loading',  'Aucune image avec loading="lazy"')
    : withLazy < n*.5 ? warn('Lazy loading', `${withLazy}/${n} images lazy`)
    :                   ok('Lazy loading',   `${withLazy}/${n} ✓`),
  ]
}

// ─────────────────────────────────────────────────────────────
// Audit d'une page
// ─────────────────────────────────────────────────────────────

async function auditPage(browser, cfg, onProgress) {
  const url = SITE + cfg.path
  onProgress?.(`Chargement de ${cfg.name}…`)

  const page = await browser.newPage()
  await page.setViewport({ width: 1280, height: 800 })
  await page.setUserAgent('Mozilla/5.0 (compatible; VizionGEOAudit/1.0)')

  const t0 = Date.now()
  await page.goto(url, { waitUntil: 'networkidle2', timeout: TIMEOUT })
  const loadMs = Date.now() - t0
  await sleep(RENDER_WAIT)

  const secs       = (loadMs / 1000).toFixed(2)
  const loadResult = loadMs > 4000 ? err('Temps de chargement', `${secs}s — objectif < 2s`)
                   : loadMs > 2000 ? warn('Temps de chargement', `${secs}s — lent`)
                   :                  ok('Temps de chargement', `${secs}s ✓`)

  onProgress?.(`Analyse de ${cfg.name}…`)

  const [
    titleR, descR, canonR, viewR, ogR, twitterR, hreflangR,
    h1R, headingsR, questionsR, wordsR, sentR, statsR, extR, faqVisR, timeR,
    imgResults,
    jsonldR,
  ] = await Promise.all([
    checkTitle(page), checkMetaDesc(page), checkCanonical(page),
    checkViewport(page), checkOpenGraph(page), checkTwitterCard(page), checkHreflang(page),
    checkH1(page), checkHeadings(page), checkQuestionsInTitles(page),
    checkWordCount(page, cfg.minWords), checkSentenceLength(page),
    checkStatistics(page), checkExternalLinks(page), checkFAQVisible(page), checkTimeTag(page),
    checkImages(page),
    checkJSONLD(page),
  ])

  await page.close()

  return {
    name: cfg.name,
    url,
    loadMs,
    groups: [
      {
        id: 'meta',
        name: 'Méta & Indexation',
        icon: '🏷️',
        criteria: [titleR, descR, canonR, viewR, ogR, twitterR, hreflangR],
      },
      {
        id: 'schema',
        name: 'Données structurées',
        icon: '🗂️',
        criteria: [jsonldR.jsonLd, jsonldR.orgSchema, jsonldR.webpageSchema, jsonldR.faqSchema, jsonldR.dateSchema, jsonldR.schemaTypes],
      },
      {
        id: 'content',
        name: 'Qualité du contenu',
        icon: '📝',
        criteria: [h1R, headingsR, wordsR, sentR, questionsR, statsR, extR, faqVisR, timeR],
      },
      {
        id: 'perf',
        name: 'Images & Performance',
        icon: '⚡',
        criteria: [...imgResults, loadResult],
      },
    ],
  }
}

// ─────────────────────────────────────────────────────────────
// Score
// ─────────────────────────────────────────────────────────────

function calcScore(criteria) {
  if (!criteria.length) return 0
  const pts = criteria.reduce((a, c) => a + (c.status === 'ok' ? 1 : c.status === 'warning' ? 0.5 : 0), 0)
  return Math.round(pts / criteria.length * 100)
}

// ─────────────────────────────────────────────────────────────
// API
// ─────────────────────────────────────────────────────────────

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*')
  next()
})

// Sécurité globale : empêche le crash sur ErrorEvent non attrapé
process.on('unhandledRejection', (reason) => {
  console.error('⚠️  Unhandled rejection (ignoré) :', reason?.message ?? String(reason))
})

function errToString(e) {
  if (!e) return 'Erreur inconnue'
  if (typeof e === 'string') return e
  if (e.message) return e.message
  return String(e)
}

async function launchBrowser() {
  const args = ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']

  // Tentative 1 : chemin détecté (Windows Chrome via WSL ou Chromium système)
  if (CHROME_PATH) {
    try {
      console.log(`  → Tentative avec : ${CHROME_PATH}`)
      const b = await puppeteer.launch({ headless: true, executablePath: CHROME_PATH, args })
      console.log('  ✓ Navigateur lancé')
      return b
    } catch (e) {
      console.warn(`  ✗ Échec (${errToString(e)}) — tentative suivante…`)
    }
  }

  // Tentative 2 : Puppeteer bundled Chrome (sans sandbox étendu)
  try {
    console.log('  → Tentative avec Puppeteer Chrome bundled')
    const b = await puppeteer.launch({ headless: true, args })
    console.log('  ✓ Navigateur lancé (bundled)')
    return b
  } catch (e) {
    throw new Error(
      `Impossible de lancer le navigateur.\n` +
      `Cause : ${errToString(e)}\n\n` +
      `→ Solution : relancer "npm install && npm run server" depuis PowerShell/CMD Windows (pas WSL).`
    )
  }
}

// SSE — audit avec progression en temps réel
app.get('/api/audit', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')

  const send = (type, data) => {
    if (!res.writableEnded) res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`)
  }

  // Lancer l'audit dans une fonction auto-exécutée pour gérer les erreurs proprement
  ;(async () => {
    let browser = null
    try {
      send('start', { total: DEFAULT_PAGES.length })
      browser = await launchBrowser()

      const results = []
      for (let i = 0; i < DEFAULT_PAGES.length; i++) {
        const cfg = DEFAULT_PAGES[i]
        send('progress', { index: i, name: cfg.name, message: `Audit de ${cfg.name}…` })

        const pageResult = await auditPage(browser, cfg, (msg) =>
          send('progress', { index: i, name: cfg.name, message: msg })
        )

        const enriched = {
          ...pageResult,
          score: calcScore(pageResult.groups.flatMap(g => g.criteria)),
          groups: pageResult.groups.map(g => ({ ...g, score: calcScore(g.criteria) })),
        }
        results.push(enriched)
        send('page', { index: i, result: enriched })
      }

      const globalScore = Math.round(results.reduce((a, r) => a + r.score, 0) / results.length)
      send('done', { globalScore, results, auditedAt: new Date().toISOString() })

    } catch (e) {
      console.error('❌ Erreur audit :', errToString(e))
      send('error', { message: errToString(e) })
    } finally {
      if (browser) await browser.close().catch(() => {})
      res.end()
    }
  })()
})

app.listen(PORT, () => {
  console.log(`\n🔍  Serveur d'audit SEO/GEO prêt sur http://localhost:${PORT}\n`)
})
