"""Builds the Vapi assistant configuration from the deck.

Everything the voice agent is *allowed to say* is derived here from ``deck.py`` --
the same source the on-screen slides come from. The frontend receives this object
and passes it straight to ``vapi.start(assistant)``.

Why the prompt is assembled server-side rather than hard-coded in the browser:
the grounding content and the rendered slides must come from one reviewed source
so they cannot diverge. This module is that derivation step.
"""

from .deck import DECK

# Voice = OpenAI TTS on purpose: it reuses the SAME OpenAI key already needed for
# the LLM, so the demo needs no separate ElevenLabs/PlayHT provider key. "alloy" is
# a clear, neutral, professional voice that handles clinical terms cleanly. Swap on
# the Vapi dashboard if you prefer another provider.
VOICE = {"provider": "openai", "voiceId": "alloy"}

# Deepgram is Synthio's own STT stack and Vapi's default transcriber. nova-2 is
# accurate on medical terminology.
TRANSCRIBER = {"provider": "deepgram", "model": "nova-2", "language": "en"}

# Native barge-in tuning. numWords=2 means a short backchannel ("okay", "right")
# won't cut the agent off, but a real question will. See README / DECISIONS #10.
STOP_SPEAKING_PLAN = {"numWords": 2, "voiceSeconds": 0.3, "backoffSeconds": 1}

FIRST_MESSAGE = "Hi, I'm your Dupixent assistant. What would you like to know?"

# Client-side tool: no server URL, async (fire-and-forget). The browser receives
# the call via vapi.on('message') and updates the slide; no result is returned to
# the model, which is exactly what we want -- we only need the UI to change.
GOTO_SLIDE_TOOL = {
    "type": "function",
    "async": True,
    "function": {
        "name": "goto_slide",
        "description": (
            "Navigate the on-screen presentation to the slide that best addresses "
            "the user's current question. Call this BEFORE answering."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "slide_number": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": len(DECK),
                    "description": f"The slide to display, from 1 through {len(DECK)} inclusive.",
                }
            },
            "required": ["slide_number"],
        },
    },
}


def _slide_block(s) -> str:
    bullets = "\n".join(f"  - {b}" for b in s.bullets)
    return (
        f"[Slide {s.id} -- {s.title}]\n"
        f"{bullets}\n"
        f"  Speaker guidance: {s.speaker_notes}"
    )


def build_system_prompt() -> str:
    slides = "\n\n".join(_slide_block(s) for s in DECK)
    return f"""\
You are an AI medical-information assistant presenting an approved detail aid for \
DUPIXENT (dupilumab) to a healthcare professional (HCP). You are voicing what an \
HCP would otherwise hear from a medical representative.

THE DECK (this is the complete, approved content -- the only information you may present):

{slides}

HOW TO BEHAVE:
- When the HCP asks about a topic, FIRST call the goto_slide tool with the slide \
number that best matches, THEN give your spoken answer. Navigate before you speak.
- Keep spoken answers to 2-3 sentences. This is a voice conversation -- be concise \
and conversational, not a wall of text. Use the speaker guidance to sound like a \
presenter, not someone reading bullet points.
- Ground every answer ONLY in the deck above. Do not introduce facts, figures, \
indications, or comparisons that are not on a slide.
- If asked something outside this deck or off-label (other drugs, head-to-head \
claims, dosing for indications not shown, individual patient treatment decisions), \
do not speculate. Say it's outside the approved information you can share here and \
offer to connect them with Medical Information for a full response.
- You may be interrupted mid-sentence; that is expected. Stop, listen, and address \
the new question.
- Open with your greeting, then follow the HCP's lead."""


def build_assistant() -> dict:
    """The inline assistant object passed to vapi.start() on the client."""
    return {
        "firstMessage": FIRST_MESSAGE,
        # Vapi makes the firstMessage non-interruptible by default; enable barge-in
        # on the greeting too, since interrupting at any point is a core requirement.
        "firstMessageInterruptionsEnabled": True,
        "model": {
            "provider": "openai",
            "model": "gpt-4o",
            "temperature": 0.3,
            "messages": [{"role": "system", "content": build_system_prompt()}],
            "tools": [GOTO_SLIDE_TOOL],
        },
        "voice": VOICE,
        "transcriber": TRANSCRIBER,
        "stopSpeakingPlan": STOP_SPEAKING_PLAN,
        # Deliver tool calls to the browser (not a server webhook).
        "clientMessages": ["tool-calls"],
    }
