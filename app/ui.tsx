// app/ui.tsx — petit kit présentational, branding Sylvy (crème + encre + un vert
// héros). Composants purs (sans handler) → utilisables côté serveur ET client.
import Link from "next/link";
import type { ReactNode } from "react";

export const btn = {
  primary:
    "inline-flex items-center gap-2 rounded-full bg-sy-ink px-5 py-2.5 text-sm font-medium text-sy-cream transition hover:opacity-90 active:scale-[0.98] disabled:opacity-40",
  green:
    "inline-flex items-center gap-2 rounded-full bg-sy-green-deep px-5 py-2.5 text-sm font-medium text-white transition hover:opacity-90 active:scale-[0.98] disabled:opacity-40",
  ghost:
    "inline-flex items-center gap-2 rounded-full border border-sy-line bg-sy-cream px-5 py-2.5 text-sm font-medium text-sy-ink transition hover:bg-sy-cream-2 active:scale-[0.98] disabled:opacity-40",
};

export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="sy-eyebrow">{children}</p>;
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`sy-card p-5 ${className}`}>{children}</div>;
}

export function PageShell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10">
      <header className="mb-8 flex items-center justify-between">
        <Link href="/" className="flex items-baseline gap-2">
          <span className="text-lg font-semibold tracking-tight text-sy-ink">Octopus</span>
          <span className="sy-eyebrow">wet lab OS</span>
        </Link>
        <nav className="flex gap-4 text-sm text-sy-ink-muted">
          <Link href="/protocol" className="hover:text-sy-ink">Protocole</Link>
          <Link href="/memory" className="hover:text-sy-ink">Mémoire</Link>
        </nav>
      </header>
      {children}
    </div>
  );
}

export function PageTitle({ eyebrow, title, lead }: { eyebrow: string; title: string; lead?: string }) {
  return (
    <div className="mb-8">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-sy-ink">{title}</h1>
      {lead && <p className="mt-2 max-w-2xl text-[18px] leading-relaxed text-sy-ink-muted">{lead}</p>}
    </div>
  );
}

export function severityColor(sev: string): string {
  return sev === "critical"
    ? "text-sy-red"
    : sev === "major"
    ? "text-sy-amber"
    : "text-sy-ink-muted";
}
