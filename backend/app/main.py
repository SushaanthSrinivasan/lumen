"""FastAPI app. One endpoint: GET /api/presentation.

It returns the slides (for rendering) and the assistant config (for vapi.start),
both derived from the single source of truth in deck.py. This runs once on page
load -- it is not on the voice hot path, so it adds nothing to turn latency.
"""

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .assistant import build_assistant
from .deck import deck_as_dicts

app = FastAPI(title="Synthio Voice Presenter API")

# Explicit allowlist. Local Vite dev runs on :5173; add the deployed frontend
# origin via FRONTEND_ORIGIN when deploying to Vercel.
ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]
if os.getenv("FRONTEND_ORIGIN"):
    ALLOWED_ORIGINS.append(os.environ["FRONTEND_ORIGIN"])

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["GET"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/api/presentation")
def presentation() -> dict:
    """Slides to render + the assistant config to start the Vapi call with."""
    return {
        "slides": deck_as_dicts(),
        "assistant": build_assistant(),
    }
