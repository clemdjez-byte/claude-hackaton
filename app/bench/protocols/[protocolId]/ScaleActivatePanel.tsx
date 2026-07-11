"use client";

import { useMemo, useState } from "react";
import { scaleMasterMix } from "@/lib/live-experiment/core/calc";
import type { Recipe, RecipeComponent } from "@/lib/live-experiment/core/types";

function num(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/\.?0+$/, "");
}

export default function ScaleActivatePanel({
  recipe,
  nReactions,
  overagePct,
  onRecipeChange,
  onScalingChange,
  onRemove,
}: {
  recipe: Recipe;
  nReactions: number;
  overagePct: number;
  onRecipeChange: (r: Recipe) => void;
  onScalingChange: (n: number, overage: number) => void;
  onRemove: () => void;
}) {
  const [collapsed, setCollapsed] = useState(false);

  const scaled = useMemo(() => {
    if (!Number.isInteger(nReactions) || nReactions <= 0 || overagePct < 0) return null;
    try {
      return scaleMasterMix(recipe, nReactions, overagePct);
    } catch {
      return null;
    }
  }, [recipe, nReactions, overagePct]);

  function updateComponent(i: number, patch: Partial<RecipeComponent>) {
    const components = recipe.components.map((c, j) => (j === i ? { ...c, ...patch } : c));
    onRecipeChange({ ...recipe, components });
  }
  function removeComponent(i: number) {
    onRecipeChange({ ...recipe, components: recipe.components.filter((_, j) => j !== i) });
  }
  function addComponent() {
    onRecipeChange({
      ...recipe,
      components: [...recipe.components, { name: "", perReaction: { value: 0, unit: "µL" } }],
    });
  }

  return (
    <div className="mb-5 rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="text-muted-soft hover:text-foreground"
            aria-label={collapsed ? "Expand" : "Collapse"}
          >
            {collapsed ? "▸" : "▾"}
          </button>
          <h2 className="text-base font-semibold tracking-tight">Scale &amp; activate</h2>
          <span className="receipt">computed · no AI</span>
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="mono-display text-[11px] text-muted-soft hover:text-danger"
        >
          ✕ remove
        </button>
      </div>

      {!collapsed && (
        <>
          {/* Ingrédients éditables */}
          <div className="mt-3 overflow-hidden rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted" style={{ background: "var(--surface-2)" }}>
                  <th className="px-3 py-2 font-medium">Ingredient</th>
                  <th className="px-3 py-2 font-medium">Volume / reaction</th>
                  <th className="px-3 py-2 font-medium">Type</th>
                  <th className="px-3 py-2 font-medium text-right">Total</th>
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {recipe.components.map((c, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="px-3 py-1.5">
                      <input
                        value={c.name}
                        onChange={(e) => updateComponent(i, { name: e.target.value })}
                        placeholder="Name"
                        className="w-full rounded-md border border-border bg-background px-2 py-1 focus:outline-none"
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min={0}
                          value={c.perReaction.value}
                          onChange={(e) =>
                            updateComponent(i, {
                              perReaction: { ...c.perReaction, value: Math.max(0, Number(e.target.value) || 0) },
                            })
                          }
                          className="w-16 rounded-md border border-border bg-background px-2 py-1 focus:outline-none"
                        />
                        <input
                          value={c.perReaction.unit}
                          onChange={(e) =>
                            updateComponent(i, {
                              perReaction: { ...c.perReaction, unit: e.target.value },
                            })
                          }
                          className="w-12 rounded-md border border-border bg-background px-2 py-1 focus:outline-none"
                        />
                      </div>
                    </td>
                    <td className="px-3 py-1.5">
                      <button
                        type="button"
                        onClick={() => updateComponent(i, { perWell: !c.perWell })}
                        className={`rounded-full px-2.5 py-1 text-[11px] ${
                          c.perWell ? "bg-brick-soft text-danger" : "bg-accent-soft text-accent"
                        }`}
                        style={c.perWell ? { background: "var(--sy-brick-soft)" } : undefined}
                      >
                        {c.perWell ? "per tube" : "shared"}
                      </button>
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums font-medium">
                      {scaled ? `${num(scaled.components[i]?.total.value ?? 0)} ${scaled.components[i]?.total.unit ?? ""}` : "—"}
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <button
                        type="button"
                        onClick={() => removeComponent(i)}
                        className="text-muted-soft hover:text-danger"
                        aria-label="Remove ingredient"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            onClick={addComponent}
            className="mt-2 text-[12px] font-semibold text-accent"
          >
            + add ingredient
          </button>

          {/* n / overage + total */}
          <div className="mt-4 flex items-end justify-between gap-4">
            <div className="flex items-end gap-4">
              <label className="flex flex-col gap-1">
                <span className="eyebrow">Reactions</span>
                <input
                  type="number"
                  min={1}
                  value={nReactions}
                  onChange={(e) => onScalingChange(Math.max(1, Math.floor(Number(e.target.value) || 0)), overagePct)}
                  className="w-20 rounded-md border border-border bg-background px-2 py-1 focus:outline-none"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="eyebrow">Overage %</span>
                <input
                  type="number"
                  min={0}
                  value={overagePct}
                  onChange={(e) => onScalingChange(nReactions, Math.max(0, Number(e.target.value) || 0))}
                  className="w-20 rounded-md border border-border bg-background px-2 py-1 focus:outline-none"
                />
              </label>
            </div>
            {scaled && (
              <div className="text-right">
                <div className="eyebrow mb-1">Shared master mix</div>
                <div className="mono-display text-3xl" style={{ color: "var(--accent-bright)" }}>
                  {num(scaled.sharedTotal.value)} {scaled.sharedTotal.unit}
                </div>
                <div className="receipt mt-1">
                  incl. {num(scaled.deadVolume.value)} {scaled.deadVolume.unit} dead volume · ×{num(scaled.effectiveFactor)}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
