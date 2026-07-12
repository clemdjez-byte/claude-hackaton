"use client";

// Formulaire de saisie du verdict scientifique d'un run (succès/échec/partiel),
// affiché en tête du rapport. La saisie déclenche saveOutcomeAction → peuplement
// du graphe du lab (extraction IA + attribution causale). Minimal volontairement
// (démo) : verdict + métrique optionnelle + raison. C'est la source EMPIRIQUE du
// Knowledge Graph : seul le chercheur connaît le vrai résultat scientifique.
import { useState, useTransition } from "react";
import { saveOutcomeAction } from "@/app/bench/actions";

type Verdict = "success" | "failure" | "partial";

export function OutcomeForm({
  runId,
  current,
}: {
  runId: string;
  current?: { verdict: Verdict; reason?: string; metric?: { value: number; unit: string } } | null;
}) {
  const [verdict, setVerdict] = useState<Verdict>(current?.verdict ?? "success");
  const [reason, setReason] = useState(current?.reason ?? "");
  const [metricValue, setMetricValue] = useState(current?.metric ? String(current.metric.value) : "");
  const [metricUnit, setMetricUnit] = useState(current?.metric?.unit ?? "");
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  return (
    <form
      className="outcome-form"
      onSubmit={(e) => {
        e.preventDefault();
        setSaved(false);
        start(async () => {
          await saveOutcomeAction(runId, {
            verdict,
            metricValue: metricValue ? Number(metricValue) : undefined,
            metricUnit: metricUnit || undefined,
            reason: reason || undefined,
          });
          setSaved(true);
        });
      }}
    >
      <div className="outcome-form-head">
        <span className="outcome-form-title">Scientific verdict</span>
        <span className="outcome-form-hint">Feeds the lab knowledge graph</span>
      </div>

      <div className="outcome-form-grid">
        <label className="outcome-field">
          <span className="outcome-field-label">Verdict</span>
          <select className="chip" value={verdict} onChange={(e) => setVerdict(e.target.value as Verdict)}>
            <option value="success">Success</option>
            <option value="partial">Partial</option>
            <option value="failure">Failure</option>
          </select>
        </label>
        <label className="outcome-field">
          <span className="outcome-field-label">Metric (optional)</span>
          <input
            className="chip"
            value={metricValue}
            onChange={(e) => setMetricValue(e.target.value)}
            placeholder="82"
            inputMode="decimal"
          />
        </label>
        <label className="outcome-field">
          <span className="outcome-field-label">Unit</span>
          <input
            className="chip"
            value={metricUnit}
            onChange={(e) => setMetricUnit(e.target.value)}
            placeholder="% viability"
          />
        </label>
      </div>

      <label className="outcome-field">
        <span className="outcome-field-label">Reason (if failure)</span>
        <input
          className="chip"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="no bands, contamination…"
        />
      </label>

      <div className="outcome-form-actions">
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? "Saving…" : current ? "Update verdict" : "Save verdict"}
        </button>
        {saved && !pending && <span className="outcome-form-saved">Saved ✓</span>}
      </div>
    </form>
  );
}
