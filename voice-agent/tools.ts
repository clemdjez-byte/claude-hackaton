// voice-agent/tools.ts — pont entre les outils du copilote vocal (format Vercel
// AI SDK v7 : description/inputSchema/execute) et les function tools de
// @livekit/agents. Trois outils sont « client » : le navigateur les exécute
// (webcam, timer), l'agent ne fait que relayer l'ordre par RPC. Les outils qui
// modifient l'état du run déclenchent onMutation (prompt + UI resynchronisés).
import { tool } from "@livekit/agents";
import { z } from "zod";
import { buildVoiceTools, type VoiceToolCtx } from "@/lib/bench/voice-copilot";

export type ClientEvent =
  | { type: "capture_photo" }
  | { type: "close_camera" }
  | { type: "timer"; label: string; seconds: number }
  | { type: "timer_control"; action: "pause" | "resume" | "stop" | "clear"; label?: string }
  | { type: "did_act" };

export type ToolDeps = {
  sendClientEvent: (ev: ClientEvent) => Promise<void>;
  onMutation: () => Promise<void>;
};

// Forme minimale d'un outil AI SDK v7 telle que produite par buildVoiceTools.
export type AiToolLike = {
  description?: string;
  inputSchema?: unknown;
  execute?: (args: Record<string, unknown>, opts: { toolCallId: string; messages: [] }) => unknown;
};

// Outils dont l'état modifié doit être répercuté (prompt de l'agent + refresh UI).
const MUTATING_TOOLS = new Set([
  "next_step", "skip_step", "step_back", "add_note", "record_measurement", "flag_deviation",
  "delete_evidence",
]);

export function buildExecute(name: string, aiTool: AiToolLike, deps: ToolDeps) {
  return async (args: Record<string, unknown>): Promise<string> => {
    if (name === "start_timer") {
      const label = String(args.label ?? "timer");
      const seconds = Math.max(1, Math.round(Number(args.seconds ?? 0)));
      await deps.sendClientEvent({ type: "timer", label, seconds });
      return `Timer « ${label} » lancé (${seconds}s), visible à l'écran.`;
    }
    if (name === "control_timer") {
      const action = String(args.action ?? "") as "pause" | "resume" | "stop" | "clear";
      const label = args.label != null ? String(args.label) : undefined;
      await deps.sendClientEvent({ type: "timer_control", action, label });
      const verb = { pause: "mis en pause", resume: "relancé", stop: "arrêté", clear: "effacé" }[action] ?? "mis à jour";
      return `Minuteur ${label ? `« ${label} » ` : ""}${verb}.`;
    }
    if (name === "capture_photo") {
      await deps.sendClientEvent({ type: "capture_photo" });
      return "Caméra déclenchée, la photo arrive dans les preuves.";
    }
    if (name === "close_camera") {
      await deps.sendClientEvent({ type: "close_camera" });
      return "Caméra coupée.";
    }
    const result = await aiTool.execute?.({ ...args }, { toolCallId: name, messages: [] });
    if (MUTATING_TOOLS.has(name)) await deps.onMutation();
    return typeof result === "string" ? result : JSON.stringify(result ?? null);
  };
}

export function buildAgentTools(ctx: VoiceToolCtx, deps: ToolDeps) {
  return Object.entries(buildVoiceTools(ctx)).map(([name, aiTool]) => {
    const t = aiTool as unknown as AiToolLike;
    return tool({
      name,
      description: t.description ?? name,
      // Les inputSchema du cœur sont des schémas zod (v4) — le format attendu.
      parameters: (t.inputSchema ?? z.object({})) as never,
      execute: buildExecute(name, t, deps),
    });
  });
}
