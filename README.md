# Vizion Academy — Outil d'audit SEO/GEO

Dashboard local d'audit SEO/GEO pour vizionacademy.fr.

## Installation

```bash
cd VizionAcademy/GEO
npm install
```

> Puppeteer télécharge Chromium automatiquement (~200 MB, une seule fois).

## Lancement

```bash
npm run dev
```

Ouvre http://localhost:5174, clique **Lancer l'audit**.

## Ce que ça vérifie

| Catégorie | Critères |
|-----------|----------|
| Méta & Indexation | title, meta description, canonical, viewport, Open Graph, Twitter Card, hreflang |
| Données structurées | JSON-LD, Organization, WebPage/Service, FAQPage, datePublished |
| Qualité du contenu | H1/H2/H3, nombre de mots, longueur phrases, questions, chiffres, liens externes, FAQ visible, balise time |
| Images & Performance | alt tags, srcset, lazy loading, temps de chargement |

## Architecture

```
GEO/
├── server.mjs        ← Express + Puppeteer (port 3099)
├── src/
│   ├── App.vue       ← Dashboard principal
│   ├── stores/audit.js
│   └── components/
│       ├── ScoreCircle.vue
│       ├── PageCard.vue
│       ├── GroupCard.vue
│       └── CriterionRow.vue
```
"# GEO"  
