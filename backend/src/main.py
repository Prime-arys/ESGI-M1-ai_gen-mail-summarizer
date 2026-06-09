"""
Backend de résumé de mails. Reçoit des mails depuis l'extension,
appelle Gemini pour générer un résumé de chacun, renvoie les résumés.

La clé API Gemini reste côté serveur (lue via GEMINI_API_KEY).

Lancer :
    uv sync
    ./start.ps1
"""
import asyncio
import json
import logging

from environs import Env
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from google import genai
from google.genai import types
from pydantic import BaseModel, Field

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
log = logging.getLogger("mail-summarizer")

env = Env()
env.read_env()  # charge backend/.env si présent

GEMINI_API_KEY = env.str("GEMINI_API_KEY", "")
GEMINI_MODEL = env.str("GEMINI_MODEL", "gemini-2.5-flash")
# Limite la concurrence pour éviter les 429 (rate limit Gemini, surtout en free tier).
GEMINI_CONCURRENCY = env.int("GEMINI_CONCURRENCY", 2)

if not GEMINI_API_KEY:
    raise RuntimeError("GEMINI_API_KEY manquant. Renseigne-le dans backend/.env")

client = genai.Client(api_key=GEMINI_API_KEY)
_sem = asyncio.Semaphore(GEMINI_CONCURRENCY)

app = FastAPI(title="Mail Summarizer Backend")

# Le content script appelle depuis mail.google.com / outlook.live.com.
# En local on autorise tout — à restreindre si déployé.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["POST", "OPTIONS"],
    allow_headers=["*"],
)


class MailIn(BaseModel):
    id: str
    subject: str = ""
    from_: str = Field("", alias="from")
    date: str = ""
    text: str = ""
    model_config = {"populate_by_name": True}


class SummarizeRequest(BaseModel):
    mails: list[MailIn]


PROMPT = (
    "Tu es un assistant qui résume un email en français.\n"
    "Réponds STRICTEMENT en JSON, sans texte autour, au format :\n"
    '{"bullets": ["...", "...", "..."], "category": "..."}\n'
    "- 2 à 4 puces factuelles et concises (chacune ≤ 140 caractères)\n"
    '- category parmi : "newsletter", "promo", "personnel", "pro", "notification", "autre"\n'
    "Email à résumer :\n"
)


def _humanize_error(exc: Exception) -> str:
    """Extrait un message lisible depuis une exception google-genai.

    google.genai.errors.ClientError porte généralement un payload JSON sur exc.args
    avec status/code/message. On essaie ça d'abord, sinon str(exc), sinon le nom.
    """
    # Cas typique : exc.args = (status_code, {"error": {"code", "message", "status"}})
    for arg in getattr(exc, "args", ()):
        if isinstance(arg, dict):
            err = arg.get("error") if "error" in arg else arg
            if isinstance(err, dict):
                status = err.get("status") or err.get("code")
                message = err.get("message")
                if message:
                    return f"{status}: {message}" if status else str(message)
    s = str(exc).strip()
    if s and s != type(exc).__name__:
        return s[:300]
    return type(exc).__name__


async def summarize_one(mail: MailIn) -> dict:
    content = (
        f"Sujet : {mail.subject}\n"
        f"Expéditeur : {mail.from_}\n"
        f"Date : {mail.date}\n\n"
        f"{mail.text[:6000]}"
    )

    bullets: list[str]
    category = "autre"
    try:
        async with _sem:
            response = await client.aio.models.generate_content(
                model=GEMINI_MODEL,
                contents=PROMPT + content,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    temperature=0.2,
                ),
            )
        raw = (response.text or "").strip()
        parsed = json.loads(raw)
        bullets = [str(b) for b in parsed.get("bullets", [])][:4]
        category = parsed.get("category") or "autre"
    except (json.JSONDecodeError, ValueError) as exc:
        log.warning("Réponse Gemini non parsable pour mail=%s : %s", mail.id, exc)
        bullets = ["(Réponse Gemini non parsable en JSON)"]
    except Exception as exc:
        msg = _humanize_error(exc)
        log.exception("Erreur Gemini pour mail=%s : %s", mail.id, msg)
        bullets = [f"(Erreur Gemini : {msg})"]

    return {
        "id": mail.id,
        "subject": mail.subject,
        "source": mail.from_,
        "date": mail.date,
        "bullets": bullets,
        "category": category,
    }


@app.post("/summarize")
async def summarize(req: SummarizeRequest):
    if not req.mails:
        raise HTTPException(status_code=400, detail="Aucun mail fourni")
    summaries = await asyncio.gather(*(summarize_one(m) for m in req.mails))
    return {"summaries": summaries}


@app.get("/health")
async def health():
    return {"ok": True, "model": GEMINI_MODEL}
