import { useEffect, useRef, useState } from "react";
import { Deck } from "./components/Deck";
import { CallControls } from "./components/CallControls";
import { createPresenterSession, type PresenterSession } from "./vapi";
import type { CallStatus, PresentationData } from "./types";
import "./styles.css";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";
const PUBLIC_KEY = import.meta.env.VITE_VAPI_PUBLIC_KEY ?? "";

export default function App() {
  const [data, setData] = useState<PresentationData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [status, setStatus] = useState<CallStatus>("idle");
  const [callError, setCallError] = useState<string | null>(null);

  const sessionRef = useRef<PresenterSession | null>(null);

  // Load the presentation (slides + assistant config) once on mount.
  function loadPresentation() {
    setLoadError(null);
    fetch(`${API_BASE}/api/presentation`)
      .then((r) => {
        if (!r.ok) throw new Error(`Backend returned ${r.status}`);
        return r.json();
      })
      .then((d: PresentationData) => setData(d))
      .catch((e: unknown) =>
        setLoadError(e instanceof Error ? e.message : "Failed to reach the backend"),
      );
  }

  useEffect(loadPresentation, []);

  // Build the Vapi session once we have the slide count. Setting activeIndex to
  // the same value is a no-op in React, so no extra guard is needed there.
  useEffect(() => {
    if (!data || !PUBLIC_KEY) return;
    // If a prior session exists (e.g. data was reloaded after a retry), stop it
    // before replacing the ref so we never orphan a live call.
    sessionRef.current?.stop();
    const session = createPresenterSession(PUBLIC_KEY, data.slides.length, {
      onSlideIndex: setActiveIndex,
      onStatus: setStatus,
      onError: setCallError,
    });
    sessionRef.current = session;

    // Don't orphan a live call / leave the mic on if the tab closes mid-call.
    const stopOnExit = () => session.stop();
    window.addEventListener("beforeunload", stopOnExit);
    return () => {
      window.removeEventListener("beforeunload", stopOnExit);
      session.stop();
    };
  }, [data]);

  function handleStart() {
    if (!data || !sessionRef.current) return;
    setCallError(null);
    setActiveIndex(0);
    void sessionRef.current.start(data.assistant);
  }

  function handleStop() {
    sessionRef.current?.stop();
    // Force the UI back to idle directly. A stuck/slow connect may never emit a
    // 'call-end' event, so we can't rely on it to clear "connecting" -- this
    // guarantees the End button always returns the user to a usable state.
    setStatus("idle");
  }

  // --- Render states -------------------------------------------------------

  if (loadError) {
    return (
      <Shell>
        <div className="notice notice-error">
          <strong>Couldn't load the presentation.</strong>
          <p>{loadError}</p>
          <p className="notice-hint">
            Is the backend running on <code>{API_BASE}</code>?
          </p>
          <button className="btn btn-start" onClick={loadPresentation}>
            Retry
          </button>
        </div>
      </Shell>
    );
  }

  if (!data) {
    return (
      <Shell>
        <div className="notice">Loading presentation...</div>
      </Shell>
    );
  }

  const missingKey = !PUBLIC_KEY;

  return (
    <Shell>
      <Deck slides={data.slides} activeIndex={activeIndex} />

      <div className="footer">
        {missingKey ? (
          <div className="notice notice-warn">
            Set <code>VITE_VAPI_PUBLIC_KEY</code> in <code>frontend/.env</code> to enable the
            voice agent.
          </div>
        ) : (
          <CallControls status={status} onStart={handleStart} onStop={handleStop} />
        )}
        {callError && status === "error" && <div className="call-error">{callError}</div>}
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">Ather · AI Medical Information</div>
        <div className="brand-sub">DUPIXENT® (dupilumab) — HCP detail aid</div>
      </header>
      <main className="app-main">{children}</main>
    </div>
  );
}
