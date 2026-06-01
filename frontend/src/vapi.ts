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

  vapi.on("call-start", () => {
    active = true;
    cb.onStatus("listening");
  });

  vapi.on("call-end", () => {
    active = false;
    running = false;
    cb.onStatus("idle"); // never leave the UI stuck on "speaking"
  });

  vapi.on("speech-start", () => {
    if (active) cb.onStatus("speaking");
  });

  vapi.on("speech-end", () => {
    if (active) cb.onStatus("listening");
  });

  vapi.on("error", (e: unknown) => {
    if (!running) return; // user already stopped/ended; don't resurrect an error
    active = false;
    running = false;
    cb.onError(errorMessage(e));
    cb.onStatus("error");
  });

  vapi.on("message", (msg: any) => {
    // High-frequency channel (transcripts, status, etc.) -- bail out cheaply on
    // anything that isn't a tool call before doing any work.
    if (!msg || msg.type !== "tool-calls") return;

    const calls = msg.toolCallList;
    if (!Array.isArray(calls)) return;

    // A single message may carry multiple tool calls (or other tools). Take the
    // LAST goto_slide -- the final intended destination wins.
    let target: number | null = null;
    for (const call of calls) {
      const fn = call?.function;
      if (!fn || fn.name !== "goto_slide") continue;

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

    if (target === null) return;
    // A tool-call can still arrive in the brief window after the call ends;
    // don't move the deck once the session is no longer active.
    if (!active) return;
    // Clamp to the valid 1..slideCount range; ignore anything out of range
    // rather than blanking the deck.
    if (target < 1 || target > slideCount) return;

    cb.onSlideIndex(target - 1); // the one and only 1-based -> 0-based conversion
  });

  return {
    async start(assistant) {
      if (running) return; // already connecting or live -- guard against double-click
      running = true;
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
