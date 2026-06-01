# Decisions & Tradeoffs

This take-home is graded on product instinct, not surface area. This file records
what I chose, why, and — where it matters — what I chose *against*. The throughline
is restraint: building the smallest thing that fully satisfies the brief and reads
as domain-aware.

Format: **Decision — Why — Decided against (and why not).**

1. **Use case = HCP self-serve detail aid (an *Ather* scenario), not patient
   onboarding (*Helix*) or a trial summary.** Pharma detail aids already *are* slide
   decks (MLR-approved), so "voice + slides" is the real artifact made conversational,
   not a contrived pairing. The clinical vocabulary also exercises the hard problem
   Synthio actually has — voice handling of drug names and MOA terms.
   *Against:* a patient-onboarding flow (warmer but simpler vocabulary, weaker
   terminology signal); a clinical-trial summary (more authoring effort, data-heavy).

2. **Drug = DUPIXENT (dupilumab).** Synthio's customer **Soteri Skin** is in
   dermatology/eczema, and Synthio cites an immunology field-team deployment — so a
   Dupixent detail aid is exactly the artifact one of their users would hit. It also
   has a clean, visual mechanism of action and is a specialty biologic, which is where
   engagement/support programs actually matter.
   *Against:* semaglutide (more consumer-recognizable, but recognizability matters less
   when the audience is the domain); an oncology agent (strong signal but a more
   complex MOA to fit into six slides).

3. **Pre-authored deck, not generated live.** Live generation is risk with no extra
   credit and signals over-engineering. The brief says "slides on any topic of your
   choice" — i.e. *I* choose and author them.
   *Against:* generate-on-the-fly (riskier, slower, not asked for).

4. **No RAG, no vector DB — the whole deck lives in the system prompt.** RAG exists to
   fit a too-large corpus into a context window. Six slides are ~1.5k tokens; they fit
   ~100x over. Adding retrieval would feed the model *less* context (only the "matched"
   slide) and make navigation worse. Knowing *not* to reach for the heavy tool is the
   instinct being graded here.
   *Against:* a vector DB (Chroma/Pinecone) or even lightweight BM25/keyword retrieval —
   all solve a problem this app doesn't have.

5. **Orchestration = Vapi, not LiveKit.** Vapi is higher-level and gives barge-in plus
   the STT→LLM→TTS loop out of the box, so interruption is configuration rather than
   code. Faster to a working demo.
   *Against:* LiveKit (more control, but we'd hand-wire VAD, echo cancellation, and
   barge-in for no payoff at this scope). Both are in Synthio's stack.

6. **LLM = OpenAI GPT-4o.** Most battle-tested, lowest-latency, most reliable
   tool-calling path inside Vapi — and `goto_slide` has to fire reliably mid-turn.
   *Against:* Claude (equally strong at tool use, slightly less paved a path in Vapi)
   and Groq (fast, but tool-call reliability varies by model). Reliability for *voice*
   was the tiebreaker.

7. **Transcriber = Deepgram.** It's Synthio's own STT stack — on-brand and accurate on
   medical terminology, at no extra cost.

8. **`goto_slide` is a client-side tool (no server URL), not a backend webhook.** The
   thing that needs to react to the tool call is the *browser*. A server webhook would
   then have to push the event back to the UI (websocket/SSE) — more plumbing for no
   benefit. Client-side Vapi tools are one-way (no result returned to the model), which
   is exactly right: we only need the screen to change.
   *Against:* a backend tool webhook (reads as "more real," but it's slower and needs a
   push channel back to the client).

9. **`goto_slide` is LLM-decided (a numeric tool call), not keyword-matched.** The model
   sees all six slides in its prompt and picks the destination — that's the
   "agents aren't decision trees" principle made literal.
   *Against:* `if "dosing" in transcript: goto(4)` (brittle, and exactly the
   hard-coded-routing pattern to avoid); a semantic `goto_topic` argument (needless
   indirection — the model maps intent → slide number fine).

10. **Interruption = Vapi's native `stopSpeakingPlan`, tuned to `numWords: 2`.** Barge-in
    is a solved, default-on capability; requiring ~2 words stops a brief "okay"/"right"
    from cutting the agent off while still yielding instantly to a real question.
    *Against:* building VAD / echo cancellation ourselves (hard, and pointless given
    Vapi already does it).

11. **Frontend rendering = plain React (`slides[]` + `activeIndex`), not reveal.js.**
    Full programmatic control of the active slide via state, which is all tool-driven
    navigation needs, with zero library-integration friction.
    *Against:* reveal.js (an extra dependency and its own navigation API for no benefit
    at six slides).

12. **The backend exists for a real reason: single source of truth for clinical
    content.** `deck.py` is the one place slides are defined; both the rendered deck and
    the agent's grounding prompt are derived from it, so they cannot drift. In regulated
    pharma, the screen showing one efficacy figure while the agent speaks another is a
    compliance defect — this structure removes that failure mode by construction.
    *Against:* a frontend-only static build (simpler, but it wouldn't satisfy the
    "backend" requirement and would miss the compliance story); a backend that
    "keeps secrets" (the Vapi public key is publishable — there's no secret to keep, so
    that would be theater).

13. **No slide editing, no PPTX/PDF/Google-Slides upload.** None of it demonstrates the
    two mechanisms under test, all of it is a time sink with demo-breaking failure modes,
    and in a regulated setting the deck is MLR-approved and *fixed* — editability would be
    a compliance liability, not a feature.
    *Against:* an upload/parse/edit pipeline (scope creep and a negative signal).

14. **Dropped a `POST /api/log` endpoint.** A dead endpoint reads as "added to look
    thorough." The audit log it would seed is named below as the obvious next step rather
    than shipped half-built.
    *Against:* shipping it unused (worse than cutting); fully wiring and demoing it
    (deferred — out of scope for the time budget).

15. **Backend = three files (`main.py` / `deck.py` / `assistant.py`), no Pydantic.** The
    split makes the single-source-of-truth architecture legible in the file tree:
    content → derivation → serve. A `Slide` dataclass is the contract.
    *Against:* two files (leaner, but buries the content→assistant derivation that is the
    whole point); four files with Pydantic response models (dead validation on a static
    GET of our own data).

16. **`speaker_notes` is kept and fed into the prompt.** It's on-spec for a *voice*
    presenter — per-slide delivery guidance so the agent narrates instead of reading
    bullets aloud.
    *Against:* cutting it (flatter delivery — and unused fields shouldn't ship, so it
    earns its place by being used).

17. **Live on-screen transcript skipped in v1.** `clientMessages` carries only
    `tool-calls`, which keeps the message path lean and sidesteps transcript-flood
    handling. The Loom narration already shows what's being said.
    *Against:* rendering captions now (a nice flourish, but added UI/state — deferred to
    "if time").

18. **One git repo, sibling `frontend/` + `backend/`.** One clone for the reviewer, clean
    per-toolchain separation, and it maps directly onto Vercel (root `frontend/`) and
    Render (root `backend/`).
    *Against:* two repos (two links, more friction); a flat layout (`node_modules` and
    `venv` tangled together — reads junior).

19. **Deploy local-first; cloud only if time.** A working local recording is guaranteed
    on the critical path; deploy debugging stays off it.
    *Against:* deploy-first (a more impressive link, but it adds a failure point before
    the recording exists).

20. **Keys: Vapi public key in the frontend; OpenAI + Deepgram keys in the Vapi
    dashboard.** The public key is publishable by design (like a Stripe publishable key);
    provider secrets never touch the repo.
    *Against:* putting any provider secret in client code.

21. **On-label guard behavior.** The agent answers only from the deck and, for off-deck or
    off-label questions, declines and offers Medical Information follow-up. That's the
    correct real-world behavior for HCP-facing material — a compliance signal, not just UX.

---

## What I'd build next (named, not built)

- **Server-side assistant lifecycle.** In production the assistant would be created and
  validated server-side via the Vapi API and referenced by ID, rather than assembled and
  shipped to the client.
- **Audit trail.** Persist `{ question, slide_shown, timestamp, session_id }` per turn —
  the seed of the compliance/eval log a pharma customer would require.
- **Voice evals.** Automated checks for drug-name/MOA pronunciation and for on-label
  grounding (does every spoken claim trace to a slide?).
