"use client";
// Le moment wahou #2 : l'écran du bench, piloté à la voix. Push-to-talk, Claude
// agit via des outils (avance, note, minuteur, déviation, mémoire), TTS répond.
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Quantity } from "@/lib/core";
import { useVoice } from "@/hooks/useVoice";
import { advanceStepAction, deviationAction, finishRunAction, noteAction } from "../../actions";
import { Card, Eyebrow, btn, severityColor } from "../../ui";

export interface BenchData {
  runId: string;
  status: string;
  nReactions: number | null;
  currentStepId: string | null;
  steps: Array<{
    id: string;
    index: number;
    title: string;
    status: string;
    instruction: string;
    critical: boolean;
    durationSec: number | null;
    resolvedParams: Record<string, Quantity> | null;
  }>;
  evidence: Array<{
    id: string;
    kind: string;
    body: string | null;
    measurement: { value: number; unit: string; instrument?: string } | null;
    deviation: { expected: string; actual: string; reason?: string; severity: string } | null;
  }>;
}

interface Timer {
  id: number;
  label: string;
  remaining: number;
}

export function BenchConsole({ data }: { data: BenchData }) {
  const router = useRouter();
  const [reply, setReply] = useState<string>("");
  const [thinking, setThinking] = useState(false);
  const [timers, setTimers] = useState<Timer[]>([]);
  const timerSeq = useRef(0);

  const current = data.steps.find((s) => s.id === data.currentStepId) ?? null;

  const voice = useVoice({
    lang: "fr-FR",
    onTranscript: (text) => void sendTranscript(text),
  });

  const speakRef = useRef(voice.speak);
  speakRef.current = voice.speak;

  const addTimer = useCallback((label: string, seconds: number) => {
    setTimers((prev) => [...prev, { id: ++timerSeq.current, label, remaining: seconds }]);
  }, []);

  const sendTranscript = useCallback(
    async (text: string) => {
      setThinking(true);
      try {
        const res = await fetch("/api/voice", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ runId: data.runId, transcript: text }),
        }).then((r) => r.json());
        if (res.error) {
          setReply(res.error);
          speakRef.current(res.error);
          return;
        }
        setReply(res.reply);
        speakRef.current(res.reply);
        for (const t of res.timers ?? []) addTimer(t.label, t.seconds);
        if (res.didAct) router.refresh();
      } catch {
        setReply("Erreur réseau.");
      } finally {
        setThinking(false);
      }
    },
    [data.runId, addTimer, router]
  );

  // décompte des minuteurs
  useEffect(() => {
    if (timers.length === 0) return;
    const iv = setInterval(() => {
      setTimers((prev) =>
        prev
          .map((t) => ({ ...t, remaining: t.remaining - 1 }))
          .filter((t) => {
            if (t.remaining <= 0) {
              speakRef.current(`Minuteur ${t.label} terminé.`);
              return false;
            }
            return true;
          })
      );
    }, 1000);
    return () => clearInterval(iv);
  }, [timers.length]);

  const done = data.status === "completed" || data.status === "aborted";

  return (
    <div className="space-y-5">
      {/* Étape courante + voix */}
      <Card className="border-sy-green/40">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <Eyebrow>Étape courante</Eyebrow>
            {current ? (
              <>
                <h2 className="mt-1 text-xl font-semibold text-sy-ink">
                  {current.index}. {current.title}
                  {current.critical && <span className="ml-2 sy-eyebrow text-sy-red">critique</span>}
                </h2>
                <p className="mt-1 text-sm text-sy-ink-muted">{current.instruction}</p>
                {current.resolvedParams && (
                  <div className="mt-3 rounded-lg bg-sy-cream-2 p-3 font-mono text-[13px]">
                    {Object.entries(current.resolvedParams).map(([k, q]) => (
                      <div key={k} className="flex justify-between">
                        <span className="font-sans text-sy-ink-muted">{k}</span>
                        <span className="text-sy-ink">{q.value} {q.unit}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <p className="mt-1 text-sm text-sy-ink-muted">Toutes les étapes sont traitées.</p>
            )}
          </div>

          {!done && (
            <button
              onPointerDown={voice.startListening}
              onPointerUp={voice.stopListening}
              onPointerLeave={voice.stopListening}
              disabled={!voice.isSupported}
              className={`shrink-0 select-none rounded-full px-5 py-5 text-sm font-medium transition ${
                voice.isListening ? "bg-sy-green text-white animate-pulse" : "bg-sy-ink text-sy-cream"
              } disabled:opacity-40`}
              title={voice.isSupported ? "Maintenir pour parler" : "Voix non supportée (Chrome)"}
            >
              {voice.isListening ? "🎤 J'écoute" : "Maintenir\npour parler"}
            </button>
          )}
        </div>

        {(voice.interim || reply || thinking) && (
          <div className="mt-4 space-y-1 border-t border-sy-line pt-3 text-sm">
            {voice.interim && <p className="text-sy-ink-muted">« {voice.interim} »</p>}
            {thinking && <p className="text-sy-ink-muted">Octopus réfléchit…</p>}
            {reply && <p className="text-sy-ink">{reply}</p>}
          </div>
        )}
        {!voice.isSupported && (
          <p className="mt-3 text-sm text-sy-red">Reconnaissance vocale indisponible — ouvrez dans Chrome.</p>
        )}
      </Card>

      {/* Minuteurs */}
      {timers.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {timers.map((t) => (
            <div key={t.id} className="sy-card px-4 py-2 font-mono text-sm">
              <span className="font-sans text-sy-ink-muted">{t.label} · </span>
              <span className="text-sy-green-deep">{fmt(t.remaining)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Contrôles manuels */}
      {!done && (
        <div className="flex flex-wrap gap-3">
          <button onClick={() => advanceStepAction(data.runId).then(() => router.refresh())} className={btn.primary}>
            Étape suivante →
          </button>
          <button
            onClick={async () => {
              const t = window.prompt("Note :");
              if (t) await noteAction(data.runId, data.currentStepId ?? undefined, t).then(() => router.refresh());
            }}
            className={btn.ghost}
          >
            Note
          </button>
          <button
            onClick={async () => {
              const expected = window.prompt("Prévu :", "hybridation 60 °C");
              const actual = expected && window.prompt("Réalisé :", "hybridation 55 °C");
              if (expected && actual)
                await deviationAction(data.runId, data.currentStepId ?? undefined, expected, actual, "critical").then(() =>
                  router.refresh()
                );
            }}
            className={btn.ghost}
          >
            Déviation
          </button>
          <button onClick={() => finishRunAction(data.runId).then(() => router.push(`/report/${data.runId}`))} className={btn.green}>
            Terminer & rapport →
          </button>
        </div>
      )}
      {done && (
        <button onClick={() => router.push(`/report/${data.runId}`)} className={btn.green}>
          Voir le rapport →
        </button>
      )}

      {/* Preuves + étapes */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <Eyebrow>Preuves ({data.evidence.length})</Eyebrow>
          <ul className="mt-3 space-y-2 text-sm">
            {data.evidence.length === 0 && <li className="text-sy-ink-muted">Rien de capturé pour l'instant.</li>}
            {data.evidence.map((e) => (
              <li key={e.id} className="border-t border-sy-line pt-2 first:border-0 first:pt-0">
                <span className="sy-eyebrow">{e.kind}</span>{" "}
                {e.kind === "deviation" && e.deviation ? (
                  <span className={severityColor(e.deviation.severity)}>
                    {e.deviation.expected} → {e.deviation.actual}
                  </span>
                ) : e.kind === "measurement" && e.measurement ? (
                  <span className="text-sy-ink">{e.body} = {e.measurement.value} {e.measurement.unit}</span>
                ) : (
                  <span className="text-sy-ink">{e.body}</span>
                )}
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <Eyebrow>Progression</Eyebrow>
          <ol className="mt-3 space-y-1 text-sm">
            {data.steps.map((s) => (
              <li key={s.id} className={s.status === "active" ? "font-medium text-sy-ink" : "text-sy-ink-muted"}>
                {s.status === "done" ? "✓" : s.status === "active" ? "→" : "·"} {s.index}. {s.title}
              </li>
            ))}
          </ol>
        </Card>
      </div>
    </div>
  );
}

function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
