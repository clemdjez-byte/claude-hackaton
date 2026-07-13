"use client";

import { type CSSProperties, useEffect, useOptimistic, useRef, useState, useTransition } from "react";
import { useWindowsContext } from "@/app/shell/WindowsContext";
import type { Evidence, Step } from "@/lib/core";
import type { RunContext } from "@/lib/bench";
import { WebcamCapture } from "./WebcamCapture";
import {
  advanceStepAction,
  skipStepAction,
  stepBackAction,
  captureNoteAction,
  captureMeasurementAction,
  captureDeviationAction,
  deleteEvidenceAction,
  completeRunAction,
} from "./actions";
import { useVoiceRoom, type ClientEvent, type VoiceRoomStatus } from "./useVoiceRoom";

type ActiveTimer = { id: number; label: string; remaining: number; running: boolean };
type CaptureMode = "note" | "measurement" | "deviation" | "photo" | "data";

// pH, Ct, OD… n'ont pas d'unité. La brique EXIGE une unité non vide (invariant
// labo) → on stocke ce marqueur et on le masque à l'affichage.
const DIMENSIONLESS = "—";

const VOICE_STATUS_LABEL: Record<VoiceRoomStatus, string> = {
  off: "off",
  connecting: "connecting…",
  waiting_agent: "waiting for agent…",
  initializing: "starting…",
  idle: "ready",
  listening: "listening…",
  thinking: "thinking…",
  speaking: "speaking…",
  error: "error",
};

// Mutation d'étape appliquée INSTANTANÉMENT à l'écran (optimistic), le serveur
// suit en arrière-plan. Miroir EXACT de advanceStep/skipStep/stepBack (côté
// brique) pour qu'après la revalidation les props remplacent l'optimiste sans
// aucun saut visuel.
type StepMutation =
  | { kind: "advance" }
  | { kind: "skip"; stepId: string }
  | { kind: "back" };

function reduceSteps(list: Step[], m: StepMutation): Step[] {
  const sorted = [...list].sort((a, b) => a.protocolStepIndex - b.protocolStepIndex);
  if (m.kind === "advance") {
    const toComplete =
      sorted.find((s) => s.status === "active") ?? sorted.find((s) => s.status === "pending") ?? null;
    const next = sorted.find((s) => s.status === "pending" && s.id !== toComplete?.id) ?? null;
    return sorted.map((s) =>
      toComplete && s.id === toComplete.id
        ? { ...s, status: "done" as const }
        : next && s.id === next.id
          ? { ...s, status: "active" as const }
          : s
    );
  }
  if (m.kind === "skip") {
    return sorted.map((s) => (s.id === m.stepId ? { ...s, status: "skipped" as const } : s));
  }
  // back : l'étape active repasse en attente, la précédente redevient active.
  const activePos = sorted.findIndex((s) => s.status === "active");
  const cursor = activePos === -1 ? sorted.length : activePos;
  if (cursor === 0) return sorted;
  const prev = sorted[cursor - 1];
  return sorted.map((s, i) =>
    activePos !== -1 && i === activePos
      ? { ...s, status: "pending" as const }
      : s.id === prev.id
        ? { ...s, status: "active" as const }
        : s
  );
}

function StepMarker({ status }: { status: Step["status"] }) {
  if (status === "done")
    return <span className="text-accent shrink-0 mt-0.5" aria-label="done">✓</span>;
  if (status === "skipped")
    return <span className="status-dot idle shrink-0 mt-1.5" aria-label="skipped" />;
  if (status === "active")
    return <span className="status-dot active shrink-0 mt-1.5" aria-label="active" />;
  return <span className="status-dot idle shrink-0 mt-1.5" aria-label="pending" />;
}

const INPUT =
  "border border-[var(--oct-border,#E5E2D8)] rounded-[10px] px-3 py-2.5 text-sm bg-[var(--oct-paper,#fff)] focus:border-accent focus:outline-none";

// Console PLEIN ÉCRAN (full-bleed via MainFrame), 3 colonnes qui remplissent la
// largeur : étapes | ÉTAPE EN COURS (large, la section de travail) | outils.
// Rien ne scrolle au niveau page ; chaque colonne défile en interne et les
// actions (advance/skip) restent épinglées. On peut sortir à tout moment.
export default function RunConsole({
  runContext,
  evidence,
  attachmentUrls,
  reload,
}: {
  runContext: RunContext;
  evidence: Evidence[];
  attachmentUrls: Record<string, string>; // URLs locales (/api/files/[fileId]) des preuves fichier (photo + data)
  reload: () => Promise<void>; // refetch /api/bench/run/[id] (remplace router.refresh() de l'ancien modèle serveur)
}) {
  const { run, protocol } = runContext;
  const { open } = useWindowsContext();
  const [pending, start] = useTransition();
  // Transition DÉDIÉE aux étapes : l'avance est optimiste + sauvegardée en
  // arrière-plan, sans jamais griser Finish ni les captures.
  const [, startStep] = useTransition();
  const [steps, applyStep] = useOptimistic(runContext.steps, (list: Step[], m: StepMutation) =>
    reduceSteps(list, m)
  );
  // L'étape en cours se DÉDUIT des étapes (comme getRunContext côté serveur), donc
  // elle avance elle aussi instantanément.
  const currentStep =
    steps.find((s) => s.status === "active") ?? steps.find((s) => s.status === "pending") ?? null;
  const live = run.status === "active" || run.status === "paused";

  // Étape « Results » (rappel doux avant clôture) : si le protocole en a une et
  // qu'aucune preuve n'y est encore attachée, on demande confirmation avant de
  // terminer (gate souple — jamais bloquant). Se recalcule à chaque preuve ajoutée.
  const resultProto = protocol.steps.find((s) => s.isResult) ?? null;
  const resultRunStep = resultProto
    ? steps.find((s) => s.protocolStepIndex === resultProto.index) ?? null
    : null;
  const resultMissing = !!resultRunStep && !evidence.some((e) => e.stepId === resultRunStep.id);

  // File d'attente : les envois serveur se chaînent (jamais en parallèle) pour
  // qu'un double-clic rapide ne fasse pas lire deux fois la même étape active.
  const stepQueue = useRef<Promise<void>>(Promise.resolve());
  function mutateStep(m: StepMutation, action: () => Promise<void>) {
    startStep(() => {
      applyStep(m); // écran instantané
      // erreur → l'optimiste retombe sur les props ; succès ou échec, on
      // recharge ensuite le contexte de run pour rester la source de vérité.
      const send = () => action().catch(() => {}).then(() => reload());
      stepQueue.current = stepQueue.current.then(send, send);
      return stepQueue.current; // la transition reste ouverte tant que la file tourne
    });
  }

  const [mode, setMode] = useState<CaptureMode>("note");
  const [note, setNote] = useState("");
  const [meas, setMeas] = useState({ name: "", value: "", unit: "" });
  const [dev, setDev] = useState({ expected: "", actual: "", severity: "major", reason: "" });
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  // Webcam allumée ? On peut la couper (bouton Stop ou voix « ferme la caméra »)
  // sans quitter l'onglet Photo. Rallumée en entrant sur l'onglet ou à la capture.
  const [cameraOn, setCameraOn] = useState(true);
  // Photo à la voix : l'agent demande un cliché → on bascule sur l'onglet Photo
  // et WebcamCapture shoote dès que la caméra est prête (remet le drapeau à false).
  const [voicePhotoPending, setVoicePhotoPending] = useState(false);
  // Onglet Data : import d'un fichier de données depuis l'ordinateur.
  const [dataBusy, setDataBusy] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const dataInputRef = useRef<HTMLInputElement | null>(null);
  // Clôture : l'overlay rend l'attente explicite (génération = quelques secondes).
  const [finishing, setFinishing] = useState(false);
  // Navigation en LECTURE : l'index de l'étape affichée au milieu (null = suit
  // l'étape en cours). Sélectionner une étape NE change PAS l'étape en cours.
  const [manualIndex, setManualIndex] = useState<number | null>(null);
  // Observation dont on demande confirmation de suppression (inline).
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  // Rappel « Terminer sans résultat ? » (étape Results vide) avant clôture.
  const [confirmNoResult, setConfirmNoResult] = useState(false);
  // Hauteur (px) du copilote vocal au centre : réglable en glissant sa poignée
  // (vers le haut = plus grand pour lire le transcript, vers le bas = plus petit).
  const [voiceH, setVoiceH] = useState(200);
  // Auto-scroll du transcript : on colle au bas à chaque nouvelle ligne / mot.
  const transcriptRef = useRef<HTMLDivElement | null>(null);

  // Glisser la poignée : chaque pixel monté agrandit le copilote d'autant, borné.
  function startVoiceResize(startY: number) {
    const startH = voiceH;
    const onMove = (ev: PointerEvent) =>
      setVoiceH(Math.min(640, Math.max(96, startH + (startY - ev.clientY))));
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  // Largeurs (px) des colonnes latérales, réglables via les poignées verticales.
  const [leftW, setLeftW] = useState(300);
  const [rightW, setRightW] = useState(320);

  // Glisser une poignée verticale : la gauche grandit vers la droite, la droite
  // grandit vers la gauche ; le centre absorbe le reste. Bornes de sécurité.
  function startColResize(startX: number, side: "left" | "right") {
    const start = side === "left" ? leftW : rightW;
    const onMove = (ev: PointerEvent) => {
      const delta = side === "left" ? ev.clientX - startX : startX - ev.clientX;
      const next = Math.min(560, Math.max(200, start + delta));
      (side === "left" ? setLeftW : setRightW)(next);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  function confirmFinish() {
    if (finishing) return;
    // Résultat manquant : premier clic → on demande confirmation, on ne clôture pas.
    if (resultMissing && !confirmNoResult) {
      setConfirmNoResult(true);
      return;
    }
    setConfirmNoResult(false);
    setFinishing(true);
    start(async () => {
      try {
        const { runId } = await completeRunAction(run.id);
        await reload();
        open("report", { runId });
      } finally {
        setFinishing(false);
      }
    });
  }

  const stepId = currentStep?.id; // la capture s'attache à l'étape EN COURS
  const timeline = [...evidence].reverse();

  // Étape affichée au milieu = sélection manuelle, sinon l'étape en cours.
  const currentIdx = currentStep ? currentStep.protocolStepIndex : null;
  const lastIdx = steps.length ? steps[steps.length - 1].protocolStepIndex : 0;
  const displayedIdx = manualIndex ?? currentIdx ?? lastIdx;
  const displayedStep = steps.find((s) => s.protocolStepIndex === displayedIdx) ?? null;
  const displayedProto = protocol.steps.find((ps) => ps.index === displayedIdx) ?? null;
  const displayedParams = displayedStep?.resolvedParams
    ? Object.entries(displayedStep.resolvedParams)
    : [];
  const viewingCurrent = currentIdx !== null && displayedIdx === currentIdx;
  const completeAtLast = currentIdx === null && displayedIdx === lastIdx;
  const canPrev = live && (currentIdx === null ? steps.length > 0 : currentIdx > 0);

  // ── Copilote vocal (LiveKit : conversation continue, barge-in) ──
  const [timers, setTimers] = useState<ActiveTimer[]>([]);
  const timerSeq = useRef(0);

  function addTimer(label: string, seconds: number) {
    timerSeq.current += 1;
    setTimers((ts) => [
      ...ts,
      { id: timerSeq.current, label, remaining: Math.max(1, Math.round(seconds)), running: true },
    ]);
  }

  // Les ordres de l'agent (mêmes effets que l'ancien flux NDJSON).
  const voiceRoom = useVoiceRoom({
    runId: run.id,
    onEvent: (ev: ClientEvent) => {
      switch (ev.type) {
        case "timer":
          addTimer(ev.label, ev.seconds);
          break;
        case "capture_photo":
          setMode("photo");
          setCameraOn(true);
          setVoicePhotoPending(true);
          break;
        case "close_camera":
          setCameraOn(false);
          setVoicePhotoPending(false);
          break;
        case "did_act":
          void reload();
          break;
      }
    },
  });

  useEffect(() => {
    if (timers.length === 0) return;
    const iv = setInterval(() => {
      setTimers((ts) =>
        ts.map((t) => {
          if (!t.running || t.remaining === 0) return t;
          const remaining = t.remaining - 1;
          return { ...t, remaining, running: remaining > 0 ? t.running : false };
        })
      );
    }, 1000);
    return () => clearInterval(iv);
  }, [timers.length]);

  // Suit le bas du transcript : à chaque ligne ajoutée OU mot streamé sur la
  // dernière ligne, on recolle en bas pour toujours voir la conversation la plus
  // récente (comme un fil de chat).
  const lastLineText = voiceRoom.transcript[voiceRoom.transcript.length - 1]?.text;
  useEffect(() => {
    const el = transcriptRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [voiceRoom.transcript.length, lastLineText]);

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  async function uploadPhotos(files: File[]) {
    if (files.length === 0) return;
    setPhotoError(null);
    setPhotoBusy(true);
    try {
      for (const f of files) {
        const fd = new FormData();
        fd.append("runId", run.id);
        if (stepId) fd.append("stepId", stepId);
        fd.append("file", f);
        const res = await fetch("/api/bench/evidence-photo", { method: "POST", body: fd });
        if (!res.ok) {
          const b = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(b.error ?? `Error ${res.status}`);
        }
      }
      await reload();
    } catch (e) {
      setPhotoError(e instanceof Error ? e.message : "Photo upload failed.");
    } finally {
      setPhotoBusy(false);
    }
  }

  // Import de fichiers de données (CSV, Excel, PDF…) → preuve `data` rattachée au run.
  async function uploadDataFiles(files: File[]) {
    if (files.length === 0) return;
    setDataError(null);
    setDataBusy(true);
    try {
      for (const f of files) {
        const fd = new FormData();
        fd.append("runId", run.id);
        if (stepId) fd.append("stepId", stepId);
        fd.append("file", f);
        const res = await fetch("/api/bench/evidence-data", { method: "POST", body: fd });
        if (!res.ok) {
          const b = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(b.error ?? `Error ${res.status}`);
        }
      }
      await reload();
    } catch (e) {
      setDataError(e instanceof Error ? e.message : "Data import failed.");
    } finally {
      setDataBusy(false);
    }
  }

  return (
    <div className="relative h-full flex flex-col overflow-hidden px-4 sm:px-6 lg:px-8 py-4 gap-3 w-full">
      {/* Overlay de clôture : le run se termine (quelques secondes) puis le
          rapport s'ouvre dans une nouvelle fenêtre. */}
      {finishing && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-[var(--oct-paper,#FAF9F4)]/85 backdrop-blur-sm text-center px-6">
          <span className="status-dot active" aria-hidden />
          <div>
            <p className="text-lg font-semibold tracking-tight">Finishing your run</p>
            <p className="text-sm text-muted mt-1 max-w-sm">
              Closing the run and opening your report. This takes a few seconds.
            </p>
          </div>
        </div>
      )}

      {/* Header compact : sortie + identité du run + clôture */}
      <header className="shrink-0 fade-in flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <button
              type="button"
              onClick={() => open("bench-hub")}
              className="text-[13px] text-muted hover:text-foreground transition-colors shrink-0"
            >
              ← Bench
            </button>
            <h1 className="text-lg font-semibold tracking-tight truncate">{protocol.title}</h1>
            <span className={`pill ${run.status === "completed" ? "accent" : ""}`}>{run.status}</span>
          </div>
        </div>
        {live &&
          (confirmNoResult ? (
            <div className="flex items-center gap-2 shrink-0">
              <span className="receipt">Terminer sans résultat ?</span>
              <button
                type="button"
                disabled={pending || finishing}
                onClick={confirmFinish}
                className="btn-primary shrink-0 disabled:opacity-60"
              >
                {finishing ? "Finishing…" : "Terminer quand même →"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmNoResult(false)}
                className="chip"
              >
                Annuler
              </button>
            </div>
          ) : (
            <button
              type="button"
              disabled={pending || finishing}
              onClick={confirmFinish}
              className="btn-primary shrink-0 disabled:opacity-60"
            >
              {finishing ? "Finishing…" : "Finish & report →"}
            </button>
          ))}
      </header>

      {/* 3 colonnes : largeurs latérales réglables (poignées) sur desktop ; sur
          écran étroit, empilé + scroll page. */}
      <div
        style={{ "--col-left": `${leftW}px`, "--col-right": `${rightW}px` } as CSSProperties}
        className="flex-1 min-h-0 flex flex-col gap-4 lg:flex-row lg:gap-0 overflow-y-auto lg:overflow-hidden"
      >
        {/* ── Colonne 1 : la liste des étapes (référence) ── */}
        <section className="w-full lg:w-[var(--col-left)] lg:shrink-0 min-w-0 card p-5 flex flex-col min-h-0">
          <div className="flex items-baseline justify-between gap-4 mb-2 shrink-0">
            <h2 className="text-base font-semibold tracking-tight">All steps</h2>
          </div>
          <ol className="flex-1 min-h-0 overflow-y-auto space-y-1 pr-1">
            {steps.map((s) => {
              const isCurrent = s.id === currentStep?.id; // étape EN COURS (lumière verte)
              const isSelected = s.protocolStepIndex === displayedIdx; // affichée au milieu
              return (
                <li
                  key={s.id}
                  onClick={() =>
                    setManualIndex(s.protocolStepIndex === currentIdx ? null : s.protocolStepIndex)
                  }
                  className={`flex items-start gap-3 rounded-[10px] px-3 py-2 cursor-pointer border transition-colors ${
                    isCurrent ? "bg-[var(--accent-soft)]" : "hover:bg-[var(--oct-paper-2,#F0EDE3)]"
                  } ${
                    isSelected
                      ? isCurrent
                        ? "border-accent"
                        : "border-border-strong"
                      : "border-transparent"
                  }`}
                >
                  <StepMarker status={s.status} />
                  <span className="text-sm tabular-nums text-muted shrink-0 w-5 text-right">
                    {s.protocolStepIndex + 1}.
                  </span>
                  <span
                    className={`flex-1 min-w-0 text-sm font-medium ${
                      s.status === "skipped" ? "line-through text-muted" : ""
                    }`}
                  >
                    {s.title}
                  </span>
                </li>
              );
            })}
          </ol>
        </section>

        {/* Poignée gauche : glisser pour élargir/rétrécir la liste des étapes. */}
        <div
          role="separator"
          aria-orientation="vertical"
          title="Glisser pour redimensionner"
          onPointerDown={(e) => {
            e.preventDefault();
            startColResize(e.clientX, "left");
          }}
          className="group hidden lg:flex shrink-0 w-3 mx-0.5 items-center justify-center cursor-col-resize touch-none"
        >
          <span className="w-1 h-10 rounded-full bg-[var(--oct-border,#E5E2D8)] group-hover:bg-[var(--border-strong)] transition-colors" />
        </div>

        {/* ── Colonne 2 : ÉTAPE AFFICHÉE (haut) + copilote vocal (bas, redimensionnable) ── */}
        <div className="w-full lg:flex-1 min-w-0 flex flex-col min-h-0">
        <section
          className={`min-w-0 card p-6 flex flex-col min-h-0 fade-up flex-1 ${
            viewingCurrent ? "border-accent" : "border-border-strong"
          }`}
        >
          <div className="flex items-center justify-between gap-4 mb-4 shrink-0">
            <p className="eyebrow">
              {viewingCurrent
                ? "Current step"
                : displayedStep?.status === "done"
                  ? "Past step · done"
                  : displayedStep?.status === "skipped"
                    ? "Past step · skipped"
                    : "Upcoming step"}
            </p>
            <span className="receipt">
              step {displayedIdx + 1} of {steps.length}
            </span>
          </div>

          {displayedStep && displayedProto ? (
            <>
              {/* Corps : instruction + chiffres en haut, GROS timer centré dessous */}
              <div className="flex-1 min-h-0 overflow-y-auto pr-1 flex flex-col">
                <div className="space-y-5 shrink-0">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap mb-3">
                      <h2 className="text-2xl font-semibold tracking-tight">{displayedStep.title}</h2>
                      {displayedProto.critical && <span className="pill">critical</span>}
                    </div>
                    <p className="text-[17px] text-foreground/90" style={{ lineHeight: 1.7 }}>
                      {displayedProto.instruction}
                    </p>
                  </div>

                  {(displayedProto.temperature || displayedProto.durationSec || displayedParams.length > 0) && (
                    <div className="rounded-[12px] border border-[var(--oct-border,#E5E2D8)] bg-[var(--oct-paper-2,#F0EDE3)] p-4 space-y-3">
                      {(displayedProto.temperature || displayedProto.durationSec) && (
                        <div className="flex items-center gap-5 flex-wrap">
                          {displayedProto.temperature && (
                            <div>
                              <span className="eyebrow block mb-0.5">Temperature</span>
                              <span className="mono-display text-xl font-semibold tabular-nums">
                                {displayedProto.temperature.value} {displayedProto.temperature.unit}
                              </span>
                            </div>
                          )}
                          {displayedProto.durationSec && (
                            <div>
                              <span className="eyebrow block mb-0.5">Duration</span>
                              <span className="mono-display text-xl font-semibold tabular-nums">
                                {fmt(displayedProto.durationSec)}
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                      {displayedParams.length > 0 && (
                        <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5 pt-1">
                          {displayedParams.map(([k, q]) => (
                            <div key={k} className="flex items-baseline justify-between gap-3 text-sm border-b border-[var(--oct-border,#E5E2D8)]/60 py-1">
                              <span className="text-muted min-w-0 truncate">{k}</span>
                              <span className="font-medium tabular-nums shrink-0">
                                {q.value} {q.unit}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Timer ACTIF : GROS compte à rebours, centré dans l'espace restant */}
                {timers.length > 0 && (
                  <div className="flex-1 min-h-[140px] flex flex-col items-center justify-center gap-8 py-6">
                    {timers.map((t) => (
                      <div key={t.id} className="text-center">
                        <p className="eyebrow mb-2">
                          {t.label.length > 28 ? `${t.label.slice(0, 28)}…` : t.label}
                          {t.remaining > 0 && !t.running ? " · paused" : ""}
                        </p>
                        <p
                          className="mono-display font-semibold tabular-nums leading-none"
                          style={{
                            fontSize: "clamp(3.5rem, 9vw, 7rem)",
                            color:
                              t.remaining === 0
                                ? "var(--accent-bright)"
                                : t.running
                                  ? undefined
                                  : "var(--muted)",
                          }}
                        >
                          {t.remaining === 0 ? "Done" : fmt(t.remaining)}
                        </p>
                        <div className="flex items-center justify-center gap-2 mt-4">
                          {t.remaining > 0 && (
                            <button
                              type="button"
                              onClick={() =>
                                setTimers((ts) =>
                                  ts.map((x) => (x.id === t.id ? { ...x, running: !x.running } : x))
                                )
                              }
                              className="chip"
                            >
                              {t.running ? "Pause" : "Resume"}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setTimers((ts) => ts.filter((x) => x.id !== t.id))}
                            className="chip"
                          >
                            Clear
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Footer épinglé : actions (selon qu'on regarde l'étape en cours) */}
              <div className="shrink-0 pt-4 mt-1 border-t border-[var(--oct-border,#E5E2D8)] space-y-3">
                {/* Étape EN COURS : Prev (annule un Done) + Done + Skip + timer */}
                {live && viewingCurrent && currentStep && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      disabled={!canPrev}
                      title="Undo an accidental advance. Back to the previous step"
                      onClick={() => mutateStep({ kind: "back" }, () => stepBackAction(run.id))}
                      className="chip disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      ← Prev
                    </button>
                    <button
                      type="button"
                      onClick={() => mutateStep({ kind: "advance" }, () => advanceStepAction(run.id))}
                      className="btn-accent"
                    >
                      Done
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        mutateStep({ kind: "skip", stepId: currentStep.id }, () =>
                          skipStepAction(run.id, currentStep.id)
                        )
                      }
                      className="text-[13px] text-muted hover:text-foreground transition-colors px-2"
                    >
                      Skip
                    </button>
                    {displayedProto.durationSec && (
                      <button
                        type="button"
                        onClick={() => addTimer(currentStep.title, displayedProto.durationSec!)}
                        className="chip"
                      >
                        Start {fmt(displayedProto.durationSec)} timer
                      </button>
                    )}
                  </div>
                )}

                {/* Toutes les étapes faites (mais run pas encore clôturé) : Prev possible */}
                {live && completeAtLast && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      disabled={!canPrev}
                      onClick={() => mutateStep({ kind: "back" }, () => stepBackAction(run.id))}
                      className="chip disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      ← Prev
                    </button>
                    <span className="receipt">All steps done. Use Finish &amp; report above.</span>
                  </div>
                )}

                {/* On regarde une AUTRE étape que l'étape en cours → retour rapide */}
                {!viewingCurrent && !completeAtLast && (
                  <div className="flex items-center justify-between gap-3">
                    <span className="receipt">Not the current step</span>
                    <button
                      type="button"
                      onClick={() => setManualIndex(null)}
                      className="chip"
                    >
                      Back to current step →
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <p className="text-sm text-muted">No step to show.</p>
          )}
        </section>

        {/* Voice copilot — sous l'étape, hauteur réglable via la poignée (barge-in :
            parler pendant qu'il parle l'interrompt ; le micro reste ouvert). */}
        {live && (
          <>
            {/* Poignée : glisser vers le haut agrandit le copilote (plus de transcript). */}
            <div
              role="separator"
              aria-orientation="horizontal"
              title="Glisser pour redimensionner"
              onPointerDown={(e) => {
                e.preventDefault();
                startVoiceResize(e.clientY);
              }}
              className="group shrink-0 h-3 my-1 flex items-center justify-center cursor-row-resize touch-none"
            >
              <span className="h-1 w-10 rounded-full bg-[var(--oct-border,#E5E2D8)] group-hover:bg-[var(--border-strong)] transition-colors" />
            </div>
            <section
              style={{ height: voiceH }}
              className="card p-4 flex flex-col min-h-0 shrink-0"
            >
              <div className="flex items-center justify-between gap-3 shrink-0 mb-2">
                <h2 className="text-sm font-semibold tracking-tight">Voice copilot</h2>
                <div className="flex items-center gap-2">
                  {voiceRoom.status !== "off" && voiceRoom.status !== "error" && (
                    <>
                      <button
                        type="button"
                        onClick={voiceRoom.toggleMute}
                        className="chip px-2.5 py-0.5 text-[12px]"
                      >
                        {voiceRoom.muted ? "Unmute" : "Mute"}
                      </button>
                      <button
                        type="button"
                        onClick={voiceRoom.disconnect}
                        className="chip px-2.5 py-0.5 text-[12px]"
                        style={{ color: "var(--danger)" }}
                      >
                        End
                      </button>
                    </>
                  )}
                  <span className="receipt">{VOICE_STATUS_LABEL[voiceRoom.status]}</span>
                </div>
              </div>

              {voiceRoom.status === "off" || voiceRoom.status === "error" ? (
                <div className="flex-1 min-h-0 flex flex-col justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => void voiceRoom.connect()}
                    className="btn-accent w-full select-none"
                  >
                    Start conversation
                  </button>
                  {voiceRoom.error && <p className="text-[13px] text-danger">{voiceRoom.error}</p>}
                </div>
              ) : voiceRoom.transcript.length > 0 ? (
                <div ref={transcriptRef} className="flex-1 min-h-0 overflow-y-auto text-[13px] space-y-1 pr-1">
                  {voiceRoom.transcript.map((l) => (
                    <p key={l.id} className={l.from === "you" ? "text-muted" : undefined}>
                      <span className="font-medium">{l.from === "you" ? "You" : "Copilot"} · </span>
                      {l.text}
                    </p>
                  ))}
                </div>
              ) : (
                <div className="flex-1 min-h-0 flex items-center justify-center">
                  <p className="text-[13px] text-muted">Listening… say something to get started.</p>
                </div>
              )}
            </section>
          </>
        )}
        </div>

        {/* Poignée droite : glisser pour élargir/rétrécir capture + observations. */}
        <div
          role="separator"
          aria-orientation="vertical"
          title="Glisser pour redimensionner"
          onPointerDown={(e) => {
            e.preventDefault();
            startColResize(e.clientX, "right");
          }}
          className="group hidden lg:flex shrink-0 w-3 mx-0.5 items-center justify-center cursor-col-resize touch-none"
        >
          <span className="w-1 h-10 rounded-full bg-[var(--oct-border,#E5E2D8)] group-hover:bg-[var(--border-strong)] transition-colors" />
        </div>

        {/* ── Colonne 3 : capture + observations ── */}
        <div className="w-full lg:w-[var(--col-right)] lg:shrink-0 min-w-0 flex flex-col min-h-0 gap-3">
          {/* Capture — un mode à la fois */}
          {live && (
            <section className="card p-4 space-y-3 shrink-0">
              <div className="flex items-center gap-1 flex-wrap">
                {(["note", "measurement", "deviation", "photo", "data"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      setMode(m);
                      // Entrer sur Photo rallume la webcam ; en sortir annule une
                      // demande de photo vocale en attente (pas de capture parasite).
                      if (m === "photo") setCameraOn(true);
                      else setVoicePhotoPending(false);
                    }}
                    className={`tab-pill ${mode === m ? "active" : ""}`}
                  >
                    {m === "note"
                      ? "Note"
                      : m === "measurement"
                        ? "Measure"
                        : m === "deviation"
                          ? "Deviation"
                          : m === "photo"
                            ? "Photo"
                            : "Data"}
                  </button>
                ))}
              </div>

              {mode === "note" && (
                <div className="space-y-2">
                  <input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="What did you observe?"
                    className={`w-full ${INPUT}`}
                  />
                  <button
                    type="button"
                    disabled={pending || !note.trim()}
                    onClick={() =>
                      start(async () => {
                        await captureNoteAction(run.id, stepId, note.trim());
                        setNote("");
                        await reload();
                      })
                    }
                    className="btn-primary w-full disabled:opacity-50"
                  >
                    Add note
                  </button>
                </div>
              )}

              {mode === "measurement" && (
                <div className="space-y-2">
                  <input
                    value={meas.name}
                    onChange={(e) => setMeas({ ...meas, name: e.target.value })}
                    placeholder="Name (e.g. pH, Ct)"
                    className={`w-full ${INPUT}`}
                  />
                  <div className="flex gap-2">
                    <input
                      type="number"
                      value={meas.value}
                      onChange={(e) => setMeas({ ...meas, value: e.target.value })}
                      placeholder="Value"
                      className={`flex-1 min-w-0 ${INPUT}`}
                    />
                    <input
                      value={meas.unit}
                      onChange={(e) => setMeas({ ...meas, unit: e.target.value })}
                      placeholder="Unit (opt.)"
                      className={`flex-1 min-w-0 ${INPUT}`}
                    />
                  </div>
                  <button
                    type="button"
                    disabled={pending || !meas.value.trim()}
                    onClick={() =>
                      start(async () => {
                        await captureMeasurementAction(run.id, stepId, {
                          name: meas.name.trim() || undefined,
                          value: Number(meas.value),
                          unit: meas.unit.trim() || DIMENSIONLESS,
                        });
                        setMeas({ name: "", value: "", unit: "" });
                        await reload();
                      })
                    }
                    className="btn-primary w-full disabled:opacity-50"
                  >
                    Record
                  </button>
                </div>
              )}

              {mode === "deviation" && (
                <div className="space-y-2">
                  <input
                    value={dev.expected}
                    onChange={(e) => setDev({ ...dev, expected: e.target.value })}
                    placeholder="Expected"
                    className={`w-full ${INPUT}`}
                  />
                  <input
                    value={dev.actual}
                    onChange={(e) => setDev({ ...dev, actual: e.target.value })}
                    placeholder="Actual"
                    className={`w-full ${INPUT}`}
                  />
                  <div className="flex gap-2">
                    <select
                      value={dev.severity}
                      onChange={(e) => setDev({ ...dev, severity: e.target.value })}
                      className={`shrink-0 ${INPUT}`}
                    >
                      <option value="minor">minor</option>
                      <option value="major">major</option>
                      <option value="critical">critical</option>
                    </select>
                    <input
                      value={dev.reason}
                      onChange={(e) => setDev({ ...dev, reason: e.target.value })}
                      placeholder="Why? (opt.)"
                      className={`flex-1 min-w-0 ${INPUT}`}
                    />
                  </div>
                  <button
                    type="button"
                    disabled={pending || !dev.expected.trim() || !dev.actual.trim()}
                    onClick={() =>
                      start(async () => {
                        await captureDeviationAction(run.id, stepId, {
                          expected: dev.expected.trim(),
                          actual: dev.actual.trim(),
                          severity: dev.severity as "minor" | "major" | "critical",
                          reason: dev.reason.trim() || undefined,
                        });
                        setDev({ expected: "", actual: "", severity: "major", reason: "" });
                        await reload();
                      })
                    }
                    className="btn-primary w-full disabled:opacity-50"
                  >
                    Flag deviation
                  </button>
                </div>
              )}

              {mode === "photo" && (
                <div className="space-y-3">
                  {/* Webcam de l'ordi en direct — capture au bouton OU à la voix.
                      On peut la couper (Stop / « ferme la caméra ») → voyant éteint. */}
                  {cameraOn ? (
                    <>
                      <WebcamCapture
                        onCapture={(f) => void uploadPhotos([f])}
                        busy={photoBusy}
                        autoCapture={voicePhotoPending}
                        onAutoCaptured={() => setVoicePhotoPending(false)}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setCameraOn(false);
                          setVoicePhotoPending(false);
                        }}
                        className="chip w-full justify-center"
                      >
                        Stop camera
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setCameraOn(true)}
                      className="btn-primary w-full"
                    >
                      Start camera
                    </button>
                  )}
                  {photoError && <p className="text-[13px] text-danger">{photoError}</p>}
                </div>
              )}

              {mode === "data" && (
                <div className="space-y-3">
                  <p className="text-[13px] text-muted">
                    Import raw data from an instrument or tool: CSV, Excel, PDF, TXT, JSON.
                  </p>
                  <input
                    ref={dataInputRef}
                    type="file"
                    accept=".csv,.tsv,.txt,.json,.xlsx,.xls,.pdf,.dat,.tab"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      void uploadDataFiles(Array.from(e.target.files ?? []));
                      e.target.value = "";
                    }}
                  />
                  <button
                    type="button"
                    disabled={dataBusy}
                    onClick={() => dataInputRef.current?.click()}
                    className="btn-primary w-full disabled:opacity-50"
                  >
                    {dataBusy ? "Importing…" : "Import from computer"}
                  </button>
                  {dataError && <p className="text-[13px] text-danger">{dataError}</p>}
                </div>
              )}
            </section>
          )}

          {/* Observations — le fil, le plus récent d'abord */}
          <section className="card p-4 flex flex-col flex-1 min-h-0">
            <div className="flex items-baseline justify-between gap-3 mb-2 shrink-0">
              <h2 className="text-sm font-semibold tracking-tight">Observations</h2>
              <span className="receipt">{evidence.length}</span>
            </div>
            {timeline.length === 0 ? (
              <p className="text-sm text-muted">Nothing captured yet.</p>
            ) : (
              <ul className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-1">
                {timeline.map((e) => (
                  <li key={e.id} className="group flex items-start gap-2 text-[13px]">
                    <span className="pill shrink-0">{e.kind}</span>
                    <span className="flex-1 min-w-0">
                      {e.kind === "photo" ? (
                        attachmentUrls[e.id] ? (
                          <span className="flex items-center gap-2">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={attachmentUrls[e.id]}
                              alt={e.body ?? "Run photo"}
                              className="h-14 w-14 object-cover rounded-[8px] border border-[var(--oct-border,#E5E2D8)] shrink-0"
                            />
                            {e.body && <span className="min-w-0">{e.body}</span>}
                          </span>
                        ) : (
                          <span className="text-muted italic">Photo (image unavailable)</span>
                        )
                      ) : e.kind === "data" ? (
                        attachmentUrls[e.id] ? (
                          <a
                            href={attachmentUrls[e.id]}
                            download={e.source?.label ?? e.body ?? "data-file"}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-accent hover:underline break-all"
                          >
                            {e.source?.label ?? e.body ?? "Data file"}
                          </a>
                        ) : (
                          <span className="break-all">{e.source?.label ?? e.body ?? "Data file"}</span>
                        )
                      ) : e.kind === "deviation" && e.deviation ? (
                        <span>
                          <span className="font-medium">[{e.deviation.severity}]</span>{" "}
                          «{e.deviation.expected}» → «{e.deviation.actual}»
                        </span>
                      ) : e.kind === "measurement" && e.measurement ? (
                        <span className="font-medium tabular-nums">
                          {(e.body ?? `${e.measurement.value} ${e.measurement.unit}`).replace(
                            / —$/,
                            ""
                          )}
                        </span>
                      ) : (
                        <span>{e.body}</span>
                      )}
                    </span>
                    {/* Suppression avec confirmation inline */}
                    {confirmDeleteId === e.id ? (
                      <span className="shrink-0 self-center flex items-center gap-2">
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() =>
                            start(async () => {
                              await deleteEvidenceAction(run.id, e.id);
                              setConfirmDeleteId(null);
                              await reload();
                            })
                          }
                          className="text-[12px] font-medium text-danger hover:underline disabled:opacity-50"
                        >
                          Delete
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="text-[12px] text-muted hover:text-foreground"
                        >
                          Cancel
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        aria-label="Delete observation"
                        onClick={() => setConfirmDeleteId(e.id)}
                        className="shrink-0 self-center text-muted hover:text-danger text-base leading-none px-1 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                      >
                        ✕
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
