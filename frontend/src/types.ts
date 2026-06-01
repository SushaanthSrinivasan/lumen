export interface Slide {
  id: number; // 1-based
  title: string;
  bullets: string[];
  speaker_notes: string;
}

export interface PresentationData {
  slides: Slide[];
  // The inline Vapi assistant config, passed straight to vapi.start().
  // Opaque to the frontend by design -- the backend owns its shape.
  assistant: Record<string, unknown>;
}

export type CallStatus = "idle" | "connecting" | "listening" | "speaking" | "error";
