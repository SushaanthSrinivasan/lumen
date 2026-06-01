# Ather — Voice-Navigated HCP Detail Aid

A working prototype of an AI **voice** application: it presents a 6-slide clinical
detail aid for **DUPIXENT® (dupilumab)**, and a healthcare professional can simply
**talk to it**. Ask about the mechanism, dosing, or safety and the agent **navigates
to the relevant slide and answers** — and you can **interrupt it mid-sentence** at any
time, the way a real conversation works.

> I noticed **Soteri Skin** is one of your customers, so I built this as the artifact an
> *Ather* (HCP Q&A) user would actually hit: a dermatologist self-serving Dupixent's
> clinical story by voice instead of waiting for a rep.

## What it does (the two mechanisms under test)

1. **Auto slide-change from the spoken question.** The LLM is given the whole deck and a
   single `goto_slide(slide_number)` tool. When you ask something, it *decides* which
   slide answers it and calls the tool — the deck flips, then it speaks. This is
   model-driven, **not** keyword matching (see "decisions not made" below).
2. **Barge-in / interruption.** Start talking while the agent is speaking and it stops
   and listens. This is Vapi's native `stopSpeakingPlan`, tuned so a brief "okay" won't
   cut it off but a real question will.

Both happen in one gesture: interrupt the agent on the MOA slide with *"what about
dosing?"* — it halts, calls `goto_slide`, the deck jumps to Dosing, and it answers.

## Decisions I deliberately did *not* make

The most useful signal in a take-home like this is what you leave out. (Full rationale
with tradeoffs in [`DECISIONS.md`](./DECISIONS.md).)

- **No RAG / no vector DB.** Six slides fit entirely in the system prompt; retrieval
  would only *remove* context the model could use. A Chroma instance in front of six
  slides would be solving a problem this app doesn't have.
- **`goto_slide` is client-side**, so the backend has no tool-handling webhook to
  pretend to need. The browser is what reacts, so the event goes straight to the browser.
- **The Vapi key in the frontend is the *publishable* key** (like a Stripe publishable
  key) — so there's no secret-keeping theater. Provider secrets (OpenAI, Deepgram) live
  in the Vapi dashboard, never in the repo.
- **No slide editor, no PPTX/PDF upload.** In a regulated setting the deck is
  MLR-approved and fixed; editability would be a compliance liability, not a feature.

## Two product-instinct calls worth surfacing

- **One source of truth for clinical content.** `backend/app/deck.py` is the *only* place
  slides are defined. Both the on-screen deck and the agent's grounding prompt are derived
  from it, so they **cannot drift** — the screen and the spoken claims stay identical. In
  pharma, that drift is the core compliance risk, and this structure removes it by design.
- **On-label by default.** The agent answers only from the deck. Ask something off-deck or
  off-label and it declines and offers Medical Information follow-up — the correct
  real-world behavior for HCP-facing material.

## Architecture

```
Browser (React + Vapi Web SDK)                 Backend (FastAPI)
  GET /api/presentation  ───────────────────▶  deck.py  (6 slides, single source)
  renders slides  ◀──── { slides, assistant } ─ assistant.py (prompt + tool, derived)
  vapi.start(assistant)                         main.py  (serves both)
        │
        ▼
   Vapi pipeline:  Deepgram STT → GPT-4o (+ goto_slide tool) → TTS
        │
        └── 'tool-calls' message ─▶ browser flips the slide (one-way, client-side)
```

- **Frontend:** React + TypeScript (Vite). Plain React rendering; the slide is just
  `activeIndex` state. All SDK wiring and tool-call hardening live in
  [`frontend/src/vapi.ts`](./frontend/src/vapi.ts).
- **Backend:** Python FastAPI, three small files. Serves slides + the inline Vapi
  assistant config on one `GET /api/presentation` (runs once on load — not on the voice
  hot path).
- **Voice:** Vapi orchestration · OpenAI GPT-4o · Deepgram STT.

## Run it locally

**Prerequisites:** Node 18+, Python 3.11+, a Vapi account.

**One-time setup in the Vapi dashboard:** add your **OpenAI** API key — it powers both
GPT-4o *and* the voice (OpenAI TTS), so it's the only provider key you need. Deepgram STT
is Vapi's default transcriber. Then copy your **public key** for the frontend.

### Backend
```bash
cd backend
python -m venv venv
venv\Scripts\activate          # Windows  (use: source venv/bin/activate on macOS/Linux)
pip install -r requirements.txt
uvicorn app.main:app --port 8000
```

### Frontend
```bash
cd frontend
npm install
cp .env.example .env           # then set VITE_VAPI_PUBLIC_KEY
npm run dev
```

Open the printed localhost URL, click **Start conversation**, and ask:
*"What's the mechanism of action?"* → the deck jumps to the MOA slide and the agent
answers. Then interrupt it with a new question to see barge-in.

> **Tip for a clean demo:** use **headphones** (prevents the agent's own voice from
> triggering barge-in) and do one warm-up call before recording (the first call of a
> session is the slowest).

## Limitations (honest)

- Slides are hard-coded for one drug — by design (the brief is "a topic of your choice").
- The client-side tool is one-way: the model fires `goto_slide` and moves on; it doesn't
  receive a result. That's intentional — we only need the UI to change.
- Deployed: local-first. (See `DECISIONS.md` for what I'd build next: server-side
  assistant lifecycle, an audit trail, and voice evals.)
