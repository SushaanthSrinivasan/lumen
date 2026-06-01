/**
 * Vapi session wrapper. All voice-SDK wiring and every defensive guard around the
 * `goto_slide` tool call live here, isolated from React.
 *
 * The `goto_slide` tool is client-side (no server URL): when the model calls it,
 * Vapi delivers a 'tool-calls' message to the browser and we move the slide. No
 * result is returned to the model -- it's a one-way UI side-effect, which is all
 * we need.
 *
 * Index convention: the model/tool speak 1-based slide numbers. We convert to a
 * 0-based array index in exactly ONE place -- the message handler below -- so the
 * off-by-one never leaks into the rest of the app.
 */
import VapiDefault from "@vapi-ai/web";
import type { CallStatus } from "./types";

// @vapi-ai/web ships as CommonJS (exports.default = Vapi). Depending on the
// bundler's interop, the default import can arrive double-wrapped as
// { default: class } instead of the class itself. Unwrap defensively so
// `new Vapi(...)` works in every interop path.
const Vapi: typeof VapiDefault = (VapiDefault as any)?.default ?? VapiDefault;

interface SessionCallbacks {
  onSlideIndex: (index0Based: number) => void;
  onStatus: (status: CallStatus) => void;
  onError: (message: string) => void;
}

export interface PresenterSession {
  start: (assistant: Record<string, unknown>) => Promise<void>;
  stop: () => void;
}

export function createPresenterSession(
  publicKey: string,
  slideCount: number,
  cb: SessionCallbacks,
): PresenterSession {
  const vapi = new Vapi(publicKey);
  // `active`  = the call is connected and live (drives slide moves / speech state).
  // `running` = we intend to be in a call -- true from start() until stop, call-end,
  //             or error. It exists so a deliberate stop() can suppress a late SDK
  //             error event or a rejected in-flight start() that would otherwise
  //             flip a user-cancelled call back into the "error" state.
  let active = false;
  let running = false;

  // --- Self-presenting walkthrough --------------------------------------------
  // When the agent begins a deck walkthrough it calls the `start_walkthrough` tool;
  // from then on the BROWSER drives the pacing. The agent presents one slide per
  // turn and stops; on its `speech-end` we inject a system "present the next slide"
  // control message so it advances on its own -- hands-free, yet still one slide per
  // turn, so the deck never runs ahead of the voice (the bug a single multi-slide
  // turn caused). If the user actually speaks (a real barge-in), we pause the
  // walkthrough and let their question be answered normally.
  let walkthroughActive = false;
  let userSpokeThisTurn = false; // the user barged in during the current turn
  let currentSlide = 0; // deck's current 1-based slide (0 = nothing shown yet)
  let walkthroughTurns = 0; // auto-advances issued this walkthrough (runaway guard)
  let continueTimer: ReturnType<typeof setTimeout> | null = null;

  const clearContinueTimer = () => {
    if (continueTimer !== null) {
      clearTimeout(continueTimer);
      continueTimer = null;
    }
  };
  // Stop the auto-advance and clear its per-walkthrough state. Note this does NOT
  // touch `currentSlide` -- the deck stays on whatever slide is showing, which is
  // what a later resume picks up from.
  const stopWalkthrough = () => {
    walkthroughActive = false;
    walkthroughTurns = 0;
    userSpokeThisTurn = false;
    clearContinueTimer();
  };

  vapi.on("call-start", () => {
    active = true;
    currentSlide = 0;
    stopWalkthrough(); // fresh call -- never inherit a previous session's state
    cb.onStatus("listening");
  });

  vapi.on("call-end", () => {
    active = false;
    running = false;
    stopWalkthrough();
    cb.onStatus("idle"); // never leave the UI stuck on "speaking"
  });

  vapi.on("speech-start", () => {
    // speech-end is only a ~1s VAD silence gap, not a turn boundary. If the agent
    // (re)starts talking, any pending auto-continue from that gap must be cancelled
    // -- otherwise we'd inject "next slide" mid-narration. (Fix D)
    clearContinueTimer();
    userSpokeThisTurn = false; // new agent turn -- clear last turn's barge-in flag
    if (active) cb.onStatus("speaking");
  });

  vapi.on("speech-end", () => {
    if (active) cb.onStatus("listening");

    if (!walkthroughActive) return;
    if (userSpokeThisTurn) {
      // The user interrupted this slide -- stop auto-presenting and let their
      // question be handled like any other turn.
      stopWalkthrough();
      return;
    }
    // End-of-deck check keyed off the deck's real position, not a from-1 counter,
    // so a resume picks up correctly after a side question. (Fix B)
    if (currentSlide >= slideCount) {
      stopWalkthrough();
      return;
    }
    // Runaway guard: if we've already issued slideCount advances and the deck still
    // hasn't reached the end (e.g. the agent stopped emitting goto_slide), stop
    // rather than auto-continuing forever. (Fix B)
    if (walkthroughTurns >= slideCount) {
      stopWalkthrough();
      return;
    }
    // The agent finished this slide on its own -- advance after a short beat. The
    // delay gives a late barge-in time to land and cancel the auto-continue, and
    // speech-start cancels it if the agent was only pausing mid-narration. (Fix D)
    clearContinueTimer();
    continueTimer = setTimeout(() => {
      continueTimer = null;
      if (!active || !walkthroughActive || userSpokeThisTurn) return;
      walkthroughTurns += 1;
      try {
        // A role:"system" control message, NOT a user "continue": unambiguous (it
        // can't collide with a real user saying "continue") and it keeps the user
        // turn history clean. triggerResponseEnabled defaults true, so it still
        // drives the agent to present the next slide. (Fix C)
        // `as any`: vapi.send's published type doesn't include the add-message
        // control shape, but it's the SDK's documented control-message API.
        vapi.send({
          type: "add-message",
          message: { role: "system", content: "Present the next slide now." },
          triggerResponseEnabled: true,
        } as any);
      } catch {
        /* if the continue can't be sent, the user can still say "next" */
      }
    }, 700);
  });

  vapi.on("error", (e: unknown) => {
    if (!running) return; // user already stopped/ended; don't resurrect an error
    active = false;
    running = false;
    stopWalkthrough(); // don't leave an auto-advance armed after an error (Fix E)
    cb.onError(errorMessage(e));
    cb.onStatus("error");
  });

  vapi.on("message", (msg: any) => {
    if (!msg) return;

    // A real barge-in. Vapi emits a dedicated 'user-interrupted' message when the
    // user speaks over the agent -- a cleaner signal than parsing transcripts, and
    // our injected control message is an add-message (not STT) so it never surfaces
    // here. During a walkthrough this pauses the auto-advance. (Fix A)
    if (msg.type === "user-interrupted") {
      userSpokeThisTurn = true;
      clearContinueTimer(); // a pending auto-continue must yield to the user
      if (walkthroughActive) stopWalkthrough();
      return;
    }

    // High-frequency channel (status, conversation updates, etc.) -- bail out
    // cheaply on anything that isn't a tool call before doing any more work.
    if (msg.type !== "tool-calls") return;

    const calls = msg.toolCallList;
    if (!Array.isArray(calls)) return;

    // A single message may carry multiple tool calls. Take the LAST goto_slide --
    // the final intended destination wins -- and note a start_walkthrough signal.
    let target: number | null = null;
    let startWalkthrough = false;
    for (const call of calls) {
      const fn = call?.function;
      if (!fn) continue;
      if (fn.name === "start_walkthrough") {
        startWalkthrough = true;
        continue;
      }
      if (fn.name !== "goto_slide") continue;

      let args = fn.arguments;
      if (typeof args === "string") {
        try {
          args = JSON.parse(args);
        } catch {
          continue; // malformed args -> ignore this call, keep current slide
        }
      }

      const n = Number(args?.slide_number); // tolerate "3" or 3
      // Require a whole number: a fractional value like 2.5 would survive the
      // range check below and index slides[1.5] -> undefined, blanking the deck.
      if (Number.isInteger(n)) target = n;
    }

    if (startWalkthrough && active) {
      // Arm only when the call is live, and only here AFTER the active check, so a
      // tool-call that lands just after stop() can't re-arm a walkthrough. From here
      // the browser paces it: advance on each speech-end until the deck's last slide
      // or a barge-in. Reset the advance counter so a 2nd/resumed walkthrough starts
      // clean. (Fixes B + E)
      walkthroughActive = true;
      walkthroughTurns = 0;
      userSpokeThisTurn = false;
    }

    if (target === null) return;
    // A tool-call can still arrive in the brief window after the call ends;
    // don't move the deck once the session is no longer active.
    if (!active) return;
    // Clamp to the valid 1..slideCount range; ignore anything out of range
    // rather than blanking the deck.
    if (target < 1 || target > slideCount) return;

    currentSlide = target; // track the deck position for the end-of-deck check
    cb.onSlideIndex(target - 1); // the one and only 1-based -> 0-based conversion
  });

  return {
    async start(assistant) {
      if (running) return; // already connecting or live -- guard against double-click
      running = true;
      currentSlide = 0;
      stopWalkthrough(); // clear any stale walkthrough state before a new call (Fix E)
      cb.onStatus("connecting");
      try {
        await vapi.start(assistant as any);
      } catch (e) {
        if (!running) return; // stop() was called mid-connect; honor the cancel
        active = false;
        running = false;
        cb.onError(errorMessage(e));
        cb.onStatus("error");
      }
    },
    stop() {
      // Clear both flags synchronously. The 'call-end' event that also clears them
      // arrives asynchronously: in that gap a late tool-call would otherwise still
      // move the deck, and a late error event / rejected start() would flip the UI
      // back to "error" after the user deliberately cancelled.
      active = false;
      running = false;
      stopWalkthrough();
      try {
        vapi.stop();
      } catch {
        /* no-op: stopping an already-stopped call is fine */
      }
    },
  };
}

function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  try {
    return JSON.stringify(e);
  } catch {
    return "Unknown error";
  }
}
