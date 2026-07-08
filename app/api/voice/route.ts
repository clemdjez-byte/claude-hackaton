// app/api/voice/route.ts — l'agent vocal. Reçoit { runId, transcript },
// renvoie { reply, timers, didAct }. La clé LLM reste côté serveur.
import { isEnabled } from "@/lib/core";
import { getDb } from "@/lib/core";
import { handleVoiceCommand } from "@/features/voice-copilot";
import { DEMO_WS, DEMO_OPERATOR } from "@/lib/orchestrate";

export async function POST(req: Request) {
  if (!isEnabled("voiceCopilot")) {
    return Response.json({ error: "Voice Copilot désactivé (flag)." }, { status: 403 });
  }
  let body: { runId?: string; transcript?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Corps JSON invalide." }, { status: 400 });
  }
  const { runId, transcript } = body;
  if (!runId || !transcript?.trim()) {
    return Response.json({ error: "runId et transcript requis." }, { status: 400 });
  }
  try {
    const out = await handleVoiceCommand(getDb(), DEMO_WS, runId, DEMO_OPERATOR, transcript.trim());
    return Response.json(out);
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Erreur du copilote vocal." },
      { status: 500 }
    );
  }
}
