// app/api/bench/voice-token/route.ts — ticket d'entrée dans la room LiveKit du
// run. Mêmes gardes que l'ancienne route voix : flag fail-closed + run existant.
// Défauts = serveur local `livekit-server --dev` (devkey/secret).
import { NextResponse } from "next/server";
import { AccessToken } from "livekit-server-sdk";
import { isEnabled } from "@/lib/core";
import { getBenchSession } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!isEnabled("voiceCopilot")) {
    return NextResponse.json({ error: "Copilote vocal désactivé." }, { status: 403 });
  }
  const body = (await req.json().catch(() => null)) as { runId?: unknown } | null;
  const runId = typeof body?.runId === "string" && body.runId ? body.runId : null;
  if (!runId) return NextResponse.json({ error: "runId requis." }, { status: 400 });

  const { store, ctx } = getBenchSession();
  const run = await store.getRun(runId);
  if (!run) return NextResponse.json({ error: "Run introuvable." }, { status: 404 });

  const room = `bench-run-${runId}`;
  const at = new AccessToken(
    process.env.LIVEKIT_API_KEY ?? "devkey",
    process.env.LIVEKIT_API_SECRET ?? "secret",
    { identity: ctx.userId, ttl: "2h" }
  );
  at.addGrant({ room, roomJoin: true, canPublish: true, canSubscribe: true });

  return NextResponse.json({
    url: process.env.LIVEKIT_URL ?? "ws://localhost:7880",
    token: await at.toJwt(),
    room,
  });
}
