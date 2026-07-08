import Link from "next/link";
import { getDb } from "@/lib/core";
import { ensureSeed, DEMO_WS } from "@/lib/orchestrate";
import { listProtocols } from "@/features/protocol-studio";
import { PageShell, PageTitle, Card, Eyebrow, btn } from "./ui";

export const dynamic = "force-dynamic";

const MODULES = [
  ["Protocol Studio", "créer, adapter, versionner"],
  ["Workflow Builder", "protocole → exécutable"],
  ["Live Bench", "l'écran du bench"],
  ["Voice Copilot", "piloter à la voix"],
  ["Evidence Capture", "notes, photos, mesures"],
  ["Auto Report", "rapport auditable"],
  ["Lab Memory", "mémoire interrogeable"],
  ["Knowledge Graph", "relations navigables"],
];

export default async function Home() {
  const db = getDb();
  await ensureSeed(db);
  const protocols = await listProtocols(db, DEMO_WS).catch(() => []);
  const proto = protocols[0];

  return (
    <PageShell>
      <PageTitle
        eyebrow="Le scientifique augmenté à plusieurs bras"
        title="Du protocole au rapport auditable, à la voix."
        lead="Octopus transforme une intention en workflow exécutable, guide la manip à la voix, capture chaque preuve, puis génère un rapport reproductible qui alimente la mémoire du labo."
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <Eyebrow>Commencer</Eyebrow>
          <h2 className="mt-2 text-lg font-semibold text-sy-ink">Protocole RT-qPCR</h2>
          <p className="mt-1 text-sm text-sy-ink-muted">{proto ? proto.title : "Chargement…"}</p>
          <div className="mt-4 flex gap-3">
            <Link href="/protocol" className={btn.primary}>Ouvrir le studio →</Link>
            <Link href="/memory" className={btn.ghost}>Mémoire</Link>
          </div>
        </Card>

        <Card>
          <Eyebrow>La promesse</Eyebrow>
          <p className="mt-2 text-[15px] leading-relaxed text-sy-ink">
            « Je lance et documente une expérience entière sans jamais remplir un ELN à la main. »
          </p>
          <p className="mt-3 text-sm text-sy-ink-muted">
            Rien d'affirmé sans source. Chaque calcul passe par du code déterministe, jamais « de tête ».
          </p>
        </Card>
      </div>

      <div className="mt-8">
        <Eyebrow>Huit bras, un cerveau</Eyebrow>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {MODULES.map(([name, sub]) => (
            <div key={name} className="rounded-xl border border-sy-line bg-sy-cream-2 px-3 py-2">
              <div className="text-sm font-medium text-sy-ink">{name}</div>
              <div className="text-xs text-sy-ink-muted">{sub}</div>
            </div>
          ))}
        </div>
      </div>
    </PageShell>
  );
}
