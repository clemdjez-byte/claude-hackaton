"use client";
// app/chat/ToolSteps.tsx — montre que le copilote « travaille » : une ligne par
// outil appelé (🔧), et, pour scale_recipe, le TABLEAU de volumes exacts (calculés
// par du code déterministe, jamais par le LLM — donc jamais hallucinés).
import { TOOL_LABELS } from "./toolCatalog";

export type ToolStep = { name: string; args?: Record<string, unknown>; result?: Record<string, unknown> };

type Qty = { value: number; unit: string };
type Component = { name: string; perReaction: Qty; total: Qty; shared: boolean };
type ResolvedRecipe = {
  recipe: string;
  nReactions: number;
  overagePct: number;
  components: Component[];
  sharedTotal: Qty;
  deadVolume: Qty;
};

const fmt = (q: Qty) => `${Math.round(q.value * 100) / 100} ${q.unit}`;

function RecipeTable({ title, recipe }: { title?: string; recipe: ResolvedRecipe }) {
  return (
    <div className="mt-1.5 overflow-x-auto rounded-lg border border-border">
      <div className="border-b border-border bg-accent/5 px-2.5 py-1.5 text-[11px] font-medium">
        {title ?? recipe.recipe} — {recipe.nReactions} reactions (+{recipe.overagePct}% overage)
      </div>
      <table className="w-full text-[11px]">
        <thead className="text-muted">
          <tr>
            <th className="px-2.5 py-1 text-left font-medium">Component</th>
            <th className="px-2.5 py-1 text-right font-medium">/ reaction</th>
            <th className="px-2.5 py-1 text-right font-medium">total (×{recipe.nReactions})</th>
          </tr>
        </thead>
        <tbody>
          {recipe.components.map((c, i) => (
            <tr key={i} className="border-t border-border/60">
              <td className="px-2.5 py-1">{c.name}</td>
              <td className="px-2.5 py-1 text-right tabular-nums">{fmt(c.perReaction)}</td>
              <td className="px-2.5 py-1 text-right tabular-nums">{fmt(c.total)}</td>
            </tr>
          ))}
          <tr className="border-t border-border font-medium">
            <td className="px-2.5 py-1">Shared mix total</td>
            <td className="px-2.5 py-1"></td>
            <td className="px-2.5 py-1 text-right tabular-nums">{fmt(recipe.sharedTotal)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export function ToolSteps({ steps }: { steps: ToolStep[] }) {
  if (steps.length === 0) return null;
  return (
    <div className="mb-2 space-y-1">
      {steps.map((s, i) => {
        const label = TOOL_LABELS[s.name] ?? s.name;
        const done = s.result !== undefined;
        const recipe =
          s.name === "scale_recipe" && s.result?.ok
            ? (s.result.recipe as ResolvedRecipe | undefined)
            : undefined;
        return (
          <div key={i}>
            <div className="flex items-center gap-1.5 text-[11px] text-muted">
              <span aria-hidden>🔧</span>
              <span>{label}</span>
              <span className={done ? "text-accent" : "opacity-50"}>{done ? "✓" : "…"}</span>
            </div>
            {recipe && <RecipeTable title={s.result?.protocolTitle as string | undefined} recipe={recipe} />}
          </div>
        );
      })}
    </div>
  );
}
