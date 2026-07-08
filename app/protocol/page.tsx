import { getDb } from "@/lib/core";
import { ensureSeed, DEMO_WS } from "@/lib/orchestrate";
import { listProtocols, previewScaledRecipe } from "@/features/protocol-studio";
import { PageShell, PageTitle, Card, Eyebrow } from "../ui";
import { ScalePanel } from "./ScalePanel";

export const dynamic = "force-dynamic";

export default async function ProtocolPage() {
  const db = getDb();
  await ensureSeed(db);
  const protocols = await listProtocols(db, DEMO_WS);
  const proto = protocols[0];
  if (!proto) return <PageShell><p>Aucun protocole.</p></PageShell>;

  const initialScaled = previewScaledRecipe(proto, 6, 10);

  return (
    <PageShell>
      <PageTitle eyebrow={`Protocol Studio · v${proto.version}`} title={proto.title} lead={proto.summary} />

      <ScalePanel protocolId={proto.id} initialScaled={initialScaled} />

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <Card>
          <Eyebrow>Étapes ({proto.steps.length})</Eyebrow>
          <ol className="mt-3 space-y-2">
            {proto.steps.map((s) => (
              <li key={s.index} className="text-sm">
                <span className="font-medium text-sy-ink">
                  {s.index}. {s.title}
                </span>
                {s.critical && <span className="ml-2 sy-eyebrow text-sy-red">critique</span>}
                <p className="text-sy-ink-muted">{s.instruction}</p>
              </li>
            ))}
          </ol>
        </Card>

        <div className="space-y-4">
          <Card>
            <Eyebrow>Matériel</Eyebrow>
            <ul className="mt-3 space-y-1 text-sm text-sy-ink">
              {proto.materials.map((m) => (
                <li key={m.name}>
                  · {m.name}
                  {m.stockConc && <span className="text-sy-ink-muted"> ({m.stockConc.value} {m.stockConc.unit})</span>}
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <Eyebrow>Sources</Eyebrow>
            <ul className="mt-3 space-y-2 text-sm">
              {proto.sources.map((src, i) => (
                <li key={i} className="text-sy-ink-muted">
                  <span className="sy-eyebrow">{src.kind}</span> {src.label ?? src.ref}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </PageShell>
  );
}
