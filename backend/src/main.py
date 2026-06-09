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

from environs import Env
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from google import genai
from google.genai import types
from pydantic import BaseModel, Field

env = Env()
env.read_env()  # charge backend/.env si présent

GEMINI_API_KEY = env.str("GEMINI_API_KEY", "")
GEMINI_MODEL = env.str("GEMINI_MODEL", "gemini-2.5-flash")

if not GEMINI_API_KEY:
    raise RuntimeError("GEMINI_API_KEY manquant. Renseigne-le dans backend/.env")

client = genai.Client(api_key=GEMINI_API_KEY)

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


async def summarize_one(mail: MailIn) -> dict:
    content = (
        f"Sujet : {mail.subject}\n"
        f"Expéditeur : {mail.from_}\n"
        f"Date : {mail.date}\n\n"
        f"{mail.text[:6000]}"
    )

    try:
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
    except (json.JSONDecodeError, ValueError):
        bullets = ["(Résumé indisponible : réponse Gemini non parsable)"]
        category = "autre"
    except Exception as exc:
        bullets = [f"(Erreur Gemini : {type(exc).__name__})"]
        category = "autre"

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
