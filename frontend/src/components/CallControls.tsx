import type { CallStatus } from "../types";

interface CallControlsProps {
  status: CallStatus;
  onStart: () => void;
  onStop: () => void;
}

const STATUS_LABEL: Record<CallStatus, string> = {
  idle: "Ready",
  connecting: "Connecting...",
  listening: "Listening",
  speaking: "Speaking",
  error: "Error",
};

export function CallControls({ status, onStart, onStop }: CallControlsProps) {
  const callActive =
    status === "listening" || status === "speaking" || status === "connecting";
  // Guard the Start button so it can't spawn a second concurrent call.
  const canStart = status === "idle" || status === "error";

  return (
    <div className="controls">
      <div className={"status-badge status-" + status}>
        <span className="status-dot" />
        {STATUS_LABEL[status]}
      </div>

      {callActive ? (
        <button className="btn btn-stop" onClick={onStop}>
          End call
        </button>
      ) : (
        <button className="btn btn-start" onClick={onStart} disabled={!canStart}>
          Start conversation
        </button>
      )}
    </div>
  );
}
