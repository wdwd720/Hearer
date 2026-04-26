import { useState } from "react";
import "./MemoryCommandBox.css";

interface MemoryCommandBoxProps {
  onSubmit: (text: string) => Promise<void>;
  status?: "api" | "local" | "offline";
  baseUrl?: string;
}

const EXAMPLES = [
  "When I leave home for school, remind me to bring my laptop.",
  "At the pharmacy, remind me to pick up my prescription.",
  "I'll send Jason the deck tonight.",
  "Usually after dinner I cook, so if you hear beeping remind me to check the stove.",
];

export function MemoryCommandBox({ onSubmit, status, baseUrl }: MemoryCommandBoxProps) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastNote, setLastNote] = useState<string | null>(null);

  const handle = async () => {
    if (!value.trim()) return;
    setBusy(true);
    setLastNote(null);
    try {
      await onSubmit(value.trim());
      setLastNote("Saved.");
      setValue("");
    } catch (err) {
      setLastNote(
        err instanceof Error ? `Error: ${err.message}` : "Could not save."
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="hr-panel hr-mcb" aria-label="Teach Hearer">
      <header className="hr-panel-header">
        <h2 className="hr-panel-title">Teach Hearer</h2>
        <span
          className={`hr-mcb-status hr-mcb-status-${status ?? "offline"}`}
          title={baseUrl}
        >
          Memory:{" "}
          {status === "api"
            ? "API connected"
            : status === "local"
            ? "local fallback"
            : "offline"}
        </span>
      </header>
      <div className="hr-mcb-row">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Tell Hearer what to remember…"
          className="hr-mcb-input"
          onKeyDown={(e) => {
            if (e.key === "Enter") handle();
          }}
          disabled={busy}
          aria-label="Memory command"
        />
        <button
          type="button"
          className="hr-btn hr-btn-primary"
          onClick={handle}
          disabled={busy || !value.trim()}
        >
          Save
        </button>
      </div>
      <ul className="hr-mcb-examples">
        {EXAMPLES.map((ex) => (
          <li key={ex}>
            <button
              type="button"
              className="hr-mcb-example"
              onClick={() => setValue(ex)}
              disabled={busy}
            >
              {ex}
            </button>
          </li>
        ))}
      </ul>
      {lastNote && <div className="hr-mcb-note">{lastNote}</div>}
    </section>
  );
}
