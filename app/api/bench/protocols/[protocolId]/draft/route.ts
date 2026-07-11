import { getBenchSession } from "@/lib/session";

export const runtime = "nodejs";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ protocolId: string }> }
) {
  const { protocolId } = await params;
  const { store } = getBenchSession();

  const body = (await req.json().catch(() => ({}))) as {
    title?: string;
    draftDoc?: unknown;
    recipe?: unknown;
  };

  const page = await store.getPage(protocolId);
  if (!page || page.type !== "protocol") {
    return new Response("Protocol not found", { status: 404 });
  }

  // Validation minimale (calquée sur la route /pages/[pageId] de Sylvy).
  if (body.title !== undefined && (typeof body.title !== "string" || body.title.length > 200)) {
    return new Response("Invalid title", { status: 400 });
  }
  if (body.draftDoc !== undefined) {
    const d = body.draftDoc as { type?: unknown } | null;
    if (typeof d !== "object" || d === null || d.type !== "doc") {
      return new Response("Invalid draftDoc", { status: 400 });
    }
    if (JSON.stringify(body.draftDoc).length > 500_000) {
      return new Response("draftDoc too large", { status: 413 });
    }
  }
  if (
    body.recipe !== undefined &&
    body.recipe !== null &&
    (typeof body.recipe !== "object" || Array.isArray(body.recipe))
  ) {
    return new Response("Invalid recipe", { status: 400 });
  }

  const patch: { title?: string; content?: unknown; draftDoc?: unknown } = {};
  let content: Record<string, unknown> | null = null;
  const ensureContent = () => {
    if (!content) content = { ...(page.content as Record<string, unknown>) };
    return content;
  };

  if (body.draftDoc !== undefined) patch.draftDoc = body.draftDoc;
  if (typeof body.title === "string") {
    patch.title = body.title;
    ensureContent().title = body.title;
  }
  if (body.recipe !== undefined) {
    const c = ensureContent();
    if (body.recipe === null) {
      delete c.recipe;
    } else {
      c.recipe = body.recipe;
    }
  }

  if (content) patch.content = content;
  if (patch.draftDoc === undefined && patch.title === undefined && patch.content === undefined) {
    return Response.json({ ok: true });
  }

  await store.updateDraft(protocolId, patch);
  return Response.json({ ok: true });
}
