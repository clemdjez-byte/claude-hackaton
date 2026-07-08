"use client";
// Le moment wahou #1 : le master mix se recalcule par code déterministe quand on
// change le nombre de réactions. Jamais un chiffre « de tête ».
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ResolvedRecipe } from "@/lib/core";
import { scalePreviewAction, adaptProtocolAction, startRunAction } from "../actions";
import { Card, Eyebrow, btn } from "../ui";

export function ScalePanel({
  protocolId,
  initialScaled,
}: {
  protocolId: string;
  initialScaled: ResolvedRecipe | null;
}) {
  const router = useRouter();
  const [n, setN] = useState(6);
  const [overage] = useState(10);
  const [scaled, setScaled] = useState<ResolvedRecipe | null>(initialScaled);
  const [instruction, setInstruction] = useState("Adapte ce protocole pour 24 échantillons.");
  const [adaptMsg, setAdaptMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  async function rescale(next: number) {
    setN(next);
    const r = await scalePreviewAction(protocolId, next, overage);
    setScaled(r);
  }

  function adapt() {
    setAdaptMsg(null);
    start(async () => {
      const res = await adaptProtocolAction(protocolId, instruction);
      if (!res.ok) setAdaptMsg(res.error ?? "Adaptation impossible (clé LLM ?).");
      else {
        setAdaptMsg("Protocole adapté ✓");
        router.refresh();
      }
    });
  }

  function launch() {
    start(async () => {
      const { runId } = await startRunAction(protocolId, n, overage);
      router.push(`/run/${runId}`);
    });
  }

  return (
    <Card className="border-sy-green/40">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Eyebrow>Master mix — mise à l'échelle déterministe</Eyebrow>
          <p className="mt-1 text-sm text-sy-ink-muted">
            {n} réactions · excès {overage} % · calculé côté serveur, pas par le modèle.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {[6, 12, 24, 48].map((v) => (
            <button
              key={v}
              onClick={() => rescale(v)}
              className={`rounded-full px-3 py-1.5 text-sm transition ${
                n === v ? "bg-sy-ink text-sy-cream" : "border border-sy-line bg-sy-cream text-sy-ink hover:bg-sy-cream-2"
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {scaled && (
        <table className="mt-4 w-full text-sm">
          <thead>
            <tr className="sy-eyebrow text-left">
              <th className="pb-1 font-normal">Composant</th>
              <th className="pb-1 text-right font-normal">Par réaction</th>
              <th className="pb-1 text-right font-normal">×{scaled.nReactions} (excès inclus)</th>
            </tr>
          </thead>
          <tbody className="font-mono text-[13px]">
            {scaled.components.map((c) => (
              <tr key={c.name} className="border-t border-sy-line">
                <td className="py-1.5 font-sans">
                  {c.name}
                  {!c.shared && <span className="ml-2 sy-eyebrow">par puits</span>}
                </td>
                <td className="py-1.5 text-right text-sy-ink-muted">
                  {c.perReaction.value} {c.perReaction.unit}
                </td>
                <td className="py-1.5 text-right text-sy-ink">
                  {c.total.value} {c.total.unit}
                </td>
              </tr>
            ))}
            <tr className="border-t border-sy-line">
              <td className="py-1.5 font-sans font-medium">Total mix partagé</td>
              <td />
              <td className="py-1.5 text-right font-medium text-sy-green-deep">
                {scaled.sharedTotal.value} {scaled.sharedTotal.unit}
              </td>
            </tr>
          </tbody>
        </table>
      )}

      <div className="mt-5 flex flex-col gap-3 border-t border-sy-line pt-4 sm:flex-row sm:items-center">
        <input
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          className="flex-1 rounded-lg border border-sy-line bg-sy-cream px-3 py-2 text-sm outline-none focus:border-sy-ink"
          placeholder="Adapter le protocole (Claude)…"
        />
        <button onClick={adapt} disabled={pending} className={btn.ghost}>
          {pending ? "…" : "Adapter"}
        </button>
        <button onClick={launch} disabled={pending} className={btn.green}>
          Lancer un run →
        </button>
      </div>
      {adaptMsg && <p className="mt-2 text-sm text-sy-ink-muted">{adaptMsg}</p>}
    </Card>
  );
}
