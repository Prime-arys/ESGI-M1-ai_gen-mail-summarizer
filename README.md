# Newsletter Digest (extension WXT)

Extension Chrome/Firefox qui :

1. récupère tes dernières newsletters (Gmail ou Outlook) via OAuth/PKCE, **côté extension** ;
2. envoie leur texte à un **backend** qui les résume via un LLM ;
3. reçoit les résumés et **génère un PDF** affiché dans une page de l'extension.

Le backend ne détient que la clé du LLM. Les tokens mail restent côté extension.

## Arborescence

```
.
├─ wxt.config.ts
├─ package.json
├─ .env.example
├─ lib/
│  ├─ types.ts        # types partagés
│  ├─ config.ts       # IDs OAuth, URL backend, fenêtre
│  ├─ auth.ts         # flux OAuth + PKCE (le cœur)
│  ├─ providers.ts    # interface IMailProvider + Gmail + Outlook
│  ├─ summarizer.ts   # client du backend de résumé
│  └─ pdf.ts          # génération du PDF (jsPDF)
├─ entrypoints/
│  ├─ background.ts   # clic sur l'icône → ouvre la page digest
│  └─ digest/
│     ├─ index.html
│     └─ main.ts      # orchestration: fetch → résumé → PDF
└─ backend/
   └─ main.py         # exemple FastAPI + Ollama (optionnel)
```

## Installation

```bash
pnpm install        # installe wxt + jspdf, génère les types (#imports)
pnpm dev            # Chrome
pnpm dev:firefox    # Firefox
pnpm zip            # build de distribution
```

jsPDF est la seule dépendance runtime. Versions du `package.json` indicatives (`pnpm up --latest wxt` au besoin).

## Configuration OAuth

Renseigne `.env` (copie `.env.example`). Pour connaître tes URLs de redirection **exactes**, ouvre la page digest puis, dans la console :

```js
browser.identity.getRedirectURL('gmail')
browser.identity.getRedirectURL('outlook')
```

### Google (Gmail)

- Google Cloud Console → Identifiants → créer un ID client OAuth, type **Application Web**.
- URI de redirection autorisés :
  - Chrome : `https://<ID_EXTENSION>.chromiumapp.org/gmail`
  - Firefox : Google **refuse** le domaine `extensions.allizom.org` (propriété non vérifiable). On utilise l'adresse loopback `http://127.0.0.1/mozoauth2/<sous-domaine>` (le `<sous-domaine>` = partie avant `.extensions.allizom.org` renvoyée par `getRedirectURL`). Le code construit déjà cette URL automatiquement — enregistre-la telle quelle.
- Scope : `https://www.googleapis.com/auth/gmail.readonly` (scope « restricted » : OK en mode Test avec comptes autorisés ; vérification + audit lourds si publication grand public).
- ⚠️ Un client « Application Web » Google **exige le `client_secret`** à l'échange du code, même avec PKCE → renseigne `WXT_GOOGLE_CLIENT_SECRET`. Pour un vrai client public sans secret, l'alternative serait de faire l'échange du code côté backend — volontairement non couvert ici pour rester simple. Sache qu'un secret embarqué dans une extension reste extractible.

### Microsoft (Outlook / Microsoft 365)

- Entra admin center → App registrations → nouvelle inscription.
- Authentication → Add a platform → **Mobile and desktop applications**, puis active **Allow public client flows** (aucun secret nécessaire).
- URI de redirection :
  - Chrome : `https://<ID_EXTENSION>.chromiumapp.org/outlook`
  - Firefox : `https://<sous-domaine>.extensions.allizom.org/outlook` (accepté par Microsoft).
- API permissions : `Mail.Read` (déléguée). Le code demande aussi `offline_access` (refresh token).
- `WXT_MS_TENANT` : `common` (pro + perso), `consumers` (perso), ou ton tenant.

### Trouver l'ID de l'extension

- Chrome : charge l'extension non empaquetée (`chrome://extensions`, mode dev) → l'ID s'affiche.
- Firefox : fixé par `browser_specific_settings.gecko.id` dans `wxt.config.ts`.

## Backend (exemple optionnel)

`backend/main.py` : FastAPI + Ollama, expose `POST /summarize`.

```bash
pip install fastapi uvicorn httpx
uvicorn main:app --reload --port 8000
```

Contrat : `{ newsletters: [{id,subject,from,date,text}] }` → `{ summaries: [{id,subject,source,bullets,url?}] }`.
Protège l'endpoint (`BACKEND_TOKEN` + `WXT_BACKEND_TOKEN`), idéalement derrière Cloudflare Tunnel + Access.

## Sécurité (rappels)

- Aucun secret dans le bundle, *sauf* le `client_secret` Google (cf. ci-dessus).
- Access token en zone `session` (mémoire, effacée à la fermeture) ; refresh token en zone `local` (persistant, sensible).
- Scopes en lecture seule, `host_permissions` minimaux, paramètre `state` anti-CSRF, déconnexion = purge des tokens.

## Limites connues

- Firefox + Google : redirection loopback obligatoire (gérée par le code).
- Outlook : la détection repose sur `internetMessageHeaders` (`$select`) ; si vide, élargis la requête.
- Gmail : requête filtrée sur Promotions/Mises à jour + en-têtes `List-Unsubscribe`/`List-Id` ; ajustable dans `lib/providers.ts`.
