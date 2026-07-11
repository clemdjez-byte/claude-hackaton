// Sert un binaire stocké dans la table `fichier` du store SQLite (photos et
// fichiers de données rattachés à un run, cf. evidence-photo / evidence-data).
// `inline` (pas `attachment`) : le fil Observations affiche les photos et
// ouvre les fichiers de données dans un nouvel onglet.
import { getBenchSession } from "@/lib/session";

export const runtime = "nodejs";

type Params = Promise<{ fileId: string }>;

export async function GET(_req: Request, { params }: { params: Params }) {
  const { fileId } = await params;
  const { store } = getBenchSession();

  const fichier = await store.getFichier(fileId);
  if (!fichier) return new Response("File not found.", { status: 404 });
  const bytes = await store.getFichierBytes(fileId);
  if (!bytes) return new Response("File not found.", { status: 404 });

  const filename = fichier.storageKey.replace(/"/g, "");
  // `Buffer` (Node) et `BodyInit` (lib DOM) ont des types ArrayBuffer légèrement
  // désaccordés ; une copie en Uint8Array pur lève l'ambiguïté sans surcoût réel.
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": fichier.mime,
      "Content-Disposition": `inline; filename="${filename}"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
