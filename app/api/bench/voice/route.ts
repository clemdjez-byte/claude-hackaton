// Route de l'agent vocal. Reçoit { runId, transcript, lang }, renvoie un FLUX
// NDJSON (un événement JSON par ligne) : morceaux de réponse + effets (timers,
// photo, caméra) au fil de l'eau. La clé Claude reste côté serveur. Le flag de
// brique (voiceCopilot) est fail-closed dans streamVoiceCommand — pas de gate
// lab ici (pas de multi-tenant en standalone, cf. lib/session.ts).
import { streamVoiceCommand, type VoiceLang } from "@/lib/bench";
import { getBenchSession, WS } from "@/lib/session";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
  let body: { runId?: string; transcript?: string; lang?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const { runId, transcript } = body;
  if (!runId || !transcript?.trim()) {
    return Response.json({ error: "runId and transcript are required." }, { status: 400 });
  }
  const lang: VoiceLang = body.lang === "en" ? "en" : "fr";

  const { store, ctx } = getBenchSession();

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      };
      try {
        const result = await streamVoiceCommand(
          store,
          WS,
          runId,
          ctx.userId,
          transcript.trim(),
          lang
        );
        let didAct = false;
        for await (const part of result.fullStream) {
          if (part.type === "text-delta") {
            send({ type: "reply_chunk", delta: part.text });
          } else if (part.type === "tool-call") {
            didAct = true;
            if (part.toolName === "start_timer") {
              const input = part.input as { label: string; seconds: number };
              send({ type: "timer", label: input.label, seconds: input.seconds });
            } else if (part.toolName === "capture_photo") {
              send({ type: "capture_photo" });
            } else if (part.toolName === "close_camera") {
              send({ type: "close_camera" });
            }
          } else if (part.type === "error") {
            // AI SDK v7 : les erreurs de flux (rate limit, surcharge, réseau)
            // arrivent comme un chunk, pas comme une exception d'itération.
            // On la relance pour qu'elle soit rattrapée par le catch ci-dessous.
            throw part.error;
          }
        }
        if (didAct) send({ type: "did_act" });
        send({ type: "done" });
        controller.close();
      } catch (e) {
        try {
          send({ type: "error", message: e instanceof Error ? e.message : "Voice copilot error." });
        } catch {
          /* client déconnecté : le flux est déjà mort */
        }
        try {
          controller.close();
        } catch {
          /* déjà fermé */
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
