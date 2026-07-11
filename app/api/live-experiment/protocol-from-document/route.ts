export const runtime = "nodejs";

// Stub — la route réelle (extraction de documents → generateProtocolFromDocument)
// arrive en Task 5. ProtocolsClient l'appelle déjà ; en attendant, on répond un
// 501 explicite plutôt que de laisser un 404 silencieux casser le fetch.
export async function POST() {
  return Response.json(
    { error: "Not implemented yet — protocol-from-document lands in a later task." },
    { status: 501 }
  );
}
