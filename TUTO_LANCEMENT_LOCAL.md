# Tutoriel — Lancer l'outil d'audit en local (npm)

## Prérequis

- **Node.js 20 ou supérieur** — [télécharger sur nodejs.org](https://nodejs.org)
- **npm** (inclus avec Node.js)

Vérifier les versions installées :

```bash
node --version   # doit afficher v20.x.x ou supérieur
npm --version
```

---

## 1. Installer les dépendances

À faire **une seule fois** après avoir cloné/récupéré le projet.

```bash
cd VizionAcademy/GEO
npm install
```

> Puppeteer télécharge automatiquement Chromium (~200 MB). Cela peut prendre quelques minutes selon la connexion.

---

## 2. Lancer le serveur

```bash
npm run dev
```

Cette commande démarre **simultanément** :
- le serveur backend Express sur le port **3099**
- le serveur de développement Vite (frontend Vue) sur le port **5174**

---

## 3. Ouvrir l'interface

Une fois les deux serveurs démarrés, ouvrir dans le navigateur :

```
http://localhost:5174
```

Cliquer sur **"Lancer l'audit"** pour démarrer l'analyse.

L'audit dure environ **30 secondes** — les résultats s'affichent page par page en temps réel.

---

## 4. Arrêter le serveur

Dans le terminal où tourne `npm run dev`, faire :

```
Ctrl + C
```

---

## Résolution de problèmes

### `node: command not found`
Node.js n'est pas installé ou pas dans le PATH. Réinstaller depuis [nodejs.org](https://nodejs.org).

### `Cannot find module` ou erreur au démarrage
Les dépendances ne sont pas installées. Relancer :
```bash
npm install
```

### Le port 5174 ou 3099 est déjà utilisé
Un autre processus occupe le port. Identifier et stopper le processus :
```bash
# Sur Linux/macOS/WSL
lsof -i :5174
lsof -i :3099

# Sur Windows (PowerShell)
netstat -ano | findstr :5174
netstat -ano | findstr :3099
```

### Puppeteer ne trouve pas le navigateur
Sur WSL, si Chrome Windows est installé, Puppeteer le détecte automatiquement.
Sinon, installer Chromium sur le système :
```bash
sudo apt install chromium-browser   # Debian/Ubuntu/WSL
```

### L'audit échoue ou retourne une erreur réseau
Vérifier la connexion internet — l'outil crawle vizionacademy.fr en direct.

---

## Commandes disponibles

| Commande | Description |
|----------|-------------|
| `npm run dev` | Lance frontend + backend en développement |
| `npm run server` | Lance uniquement le backend (port 3099) |
| `npm run build` | Compile le frontend pour la production |
| `npm run preview` | Prévisualise le build de production |
