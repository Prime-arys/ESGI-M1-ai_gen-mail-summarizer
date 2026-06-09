"""
Backend minimal de résumé. Reçoit des newsletters, appelle un LLM (Ollama ici),
renvoie des résumés structurés. La clé/API du LLM reste côté serveur.

Lancer :
    pip install fastapi uvicorn httpx
    uvicorn main:app --reload --port 8000
"""
import json
import os

import httpx
from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "llama3.1")
BACKEND_TOKEN = os.environ.get("BACKEND_TOKEN", "")  # protège l'endpoint (vide = ouvert)

app = FastAPI()

# L'extension appelle depuis son origine. En dev on autorise tout ; à restreindre en prod.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["POST"],
    allow_headers=["*"],
)


class NewsletterIn(BaseModel):
    id: str
    subject: str
    from_: str = Field("", alias="from")
    date: str = ""
    text: str = ""
    model_config = {"populate_by_name": True}


class SummarizeRequest(BaseModel):
    newsletters: list[NewsletterIn]


PROMPT = (
    "Tu résumes une newsletter en français. Réponds en JSON strict :\n"
    '{"bullets": ["...", "..."], "url": "lien principal ou null"}\n'
    "3 à 5 puces factuelles et concises. Aucun texte hors du JSON.\n\n"
    "Newsletter :\n"
)


async def summarize_one(client: httpx.AsyncClient, n: NewsletterIn) -> dict:
    r = await client.post(
        f"{OLLAMA_URL}/api/chat",
        json={
            "model": OLLAMA_MODEL,
            "format": "json",
            "stream": False,
            "messages": [{"role": "user", "content": PROMPT + n.text[:6000]}],
        },
        timeout=120,
    )
    r.raise_for_status()
    content = r.json()["message"]["content"]
    try:
        parsed = json.loads(content)
    except json.JSONDecodeError:
        parsed = {"bullets": [content[:300]], "url": None}
    return {
        "id": n.id,
        "subject": n.subject,
        "source": n.from_,
        "bullets": parsed.get("bullets", []),
        "url": parsed.get("url") or None,
    }


@app.post("/summarize")
async def summarize(req: SummarizeRequest, authorization: str = Header(default="")):
    if BACKEND_TOKEN and authorization != f"Bearer {BACKEND_TOKEN}":
        raise HTTPException(status_code=401, detail="Unauthorized")
    async with httpx.AsyncClient() as client:
        summaries = [await summarize_one(client, n) for n in req.newsletters]
    return {"summaries": summaries}
