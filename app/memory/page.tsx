import { getDb } from "@/lib/core";
import { ensureSeed } from "@/lib/orchestrate";
import { PageShell, PageTitle } from "../ui";
import { MemorySearch } from "./MemorySearch";

export const dynamic = "force-dynamic";

export default async function MemoryPage() {
  await ensureSeed(getDb());
  return (
    <PageShell>
      <PageTitle
        eyebrow="Lab Memory"
        title="La mémoire du labo, interrogeable."
        lead="Chaque run alimente une mémoire sémantique. Les réponses pointent vers leur source — la mémoire donne la vue d'ensemble, les preuves restent traçables."
      />
      <MemorySearch />
    </PageShell>
  );
}
