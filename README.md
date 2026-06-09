# Mail Summarizer

Extension navigateur + backend local qui résume tes mails Gmail / Outlook avec **Gemini**.

## Architecture

1. L'**extension** (WXT, Chrome/Firefox) injecte un content script sur `mail.google.com`, `outlook.live.com` et `outlook.office.com`.
2. Un bouton flottant « Résumer mes mails » apparaît dans l'interface. Au clic, le content script **scrape la liste des mails ouverte dans la page** (sujet, expéditeur, snippet, date) — pas d'OAuth, rien ne quitte le navigateur côté Google/Microsoft.
3. Les mails sont envoyés en POST à un **backend FastAPI local**.
4. Le backend appelle **Gemini** (`google-genai`) pour chaque mail, en parallèle, et renvoie un résumé structuré (3-4 puces + catégorie).
5. Le content script affiche les résumés dans un panneau latéral injecté directement dans Gmail / Outlook.

La clé API Gemini reste côté serveur. Tout tourne en local (`localhost:8000`).

```
+--------------------+   POST /summarize    +-----------------+    Gemini API
|  Content script    |  ------------------> |  FastAPI local  |  -----------> Google
|  (Gmail / Outlook) |  <------------------ |  (port 8000)    |
+--------------------+   { summaries }      +-----------------+
```

## Backend

Prérequis : Python ≥ 3.12, [uv](https://docs.astral.sh/uv/).

```powershell
cd backend
cp .env.example .env       # renseigne GEMINI_API_KEY
uv sync
./start.ps1                # démarre uvicorn sur :8000
```

Clé Gemini : https://aistudio.google.com/apikey

Endpoint :

- `POST /summarize` — body : `{ "mails": [{ "id", "subject", "from", "date", "text" }] }`
- `GET /health` — sanity check

## Extension

Prérequis : Node ≥ 20, pnpm.

```powershell
cd addon
pnpm install
pnpm dev            # Chrome
pnpm dev:firefox    # Firefox
pnpm zip            # build de distribution
```

Le dev server WXT ouvre un Chrome / Firefox avec l'extension chargée. Va sur `https://mail.google.com/` ou `https://outlook.live.com/`, attends que la liste des mails s'affiche, puis clique sur **Résumer mes mails** en bas à droite.

Pour pointer vers une autre URL backend, crée `addon/.env` :

```
WXT_BACKEND_URL=http://localhost:8000
```

## Limites connues

- Les classes CSS de Gmail / Outlook changent : si rien n'est scrapé, ajuste les sélecteurs dans `addon/src/lib/scrapers/`.
- Le scraping ne lit que ce qui est **visible dans la liste** : sujet, expéditeur, snippet (≈ 100 caractères). Le résumé Gemini reste pertinent mais bref.
- En local seulement : pas d'authentification sur le backend, CORS ouvert. Ne pas exposer tel quel.


sequenceDiagram
    actor U as Utilisateur
    participant CS as Content Script<br/>(Gmail / Outlook)
    participant LS as Local Storage<br/>(storage.local)
    participant BE as Backend FastAPI<br/>(localhost:8000)
    participant G as Gemini API

    Note over CS: Page Gmail / Outlook chargée
    CS->>LS: lecture cache (TTL 30 min)
    LS-->>CS: résumés ou rien
    CS->>U: Affiche FAB ("Voir" si cache, sinon "Résumer mes mails")

    U->>CS: Clic FAB

    alt Cache présent → mode "Voir"
        CS-->>U: Affiche le panneau directement<br/>(aucun appel backend)
    else Pas de cache → mode "Résumer"
        CS->>CS: Scrape DOM des 5 derniers mails<br/>(sujet, expéditeur, snippet, date)
        CS->>BE: POST /summarize { mails }

        loop pour chaque mail (concurrence 2)
            BE->>G: generate_content(prompt + mail)
            G-->>BE: JSON { bullets, category }
        end

        BE-->>CS: { summaries }
        CS->>LS: sauvegarde résumés + timestamp
        CS-->>U: Affiche le panneau
    end

    Note over U,LS: Clic ↻ dans le header du panneau<br/>relance le cycle "Résumer" et écrase le cache.