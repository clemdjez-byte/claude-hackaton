// features/voice-copilot/tools.ts — les « bras » de l'agent.
// Chaque outil délègue à une brique via son interface publique. Le start_timer
// n'a PAS d'execute : il est joué côté navigateur (onToolCall + addToolResult).
import { tool } from "ai";
import { z } from "zod";
import type { Db, Id, Ws } from "../../core";
import { advanceStep, skipStep, stepBack, getRunContext } from "../live-bench";
import { captureNote, captureMeasurement, captureDeviation } from "../evidence-capture";
import { search } from "../lab-memory";

export interface VoiceToolCtx {
  db: Db;
  ws: Ws;
  runId: Id;
  operator: Id;
}

async function currentStepId(ctx: VoiceToolCtx): Promise<Id | undefined> {
  const rc = await getRunContext(ctx.db, ctx.runId);
  return rc?.currentStep?.id;
}

/** Construit les outils de l'agent pour un run donné (closures sur db/runId). */
export function buildVoiceTools(ctx: VoiceToolCtx) {
  return {
    next_step: tool({
      description: "Passer à l'étape suivante du run (clôt l'étape en cours, active la suivante).",
      inputSchema: z.object({}),
      execute: async () => {
        const { justCompleted, active } = await advanceStep(ctx.db, ctx.runId);
        return {
          completed: justCompleted ? { index: justCompleted.protocolStepIndex, title: justCompleted.title } : null,
          active: active ? { index: active.protocolStepIndex, title: active.title } : null,
          finished: active === null,
        };
      },
    }),

    skip_step: tool({
      description: "Sauter (skip) l'étape en cours sans la marquer faite, et passer à la suivante.",
      inputSchema: z.object({}),
      execute: async () => {
        const id = await currentStepId(ctx);
        if (!id) return { skipped: false, reason: "aucune étape en cours" };
        const s = await skipStep(ctx.db, id);
        return { skipped: true, step: { index: s.protocolStepIndex, title: s.title } };
      },
    }),

    step_back: tool({
      description: "Reculer d'une étape (annuler une avance : l'étape précédente redevient l'étape en cours).",
      inputSchema: z.object({}),
      execute: async () => {
        const { active } = await stepBack(ctx.db, ctx.runId);
        return { active: active ? { index: active.protocolStepIndex, title: active.title } : null };
      },
    }),

    capture_photo: tool({
      description:
        "Prendre une photo avec la webcam (ex. « prends une photo du gel »). La capture se fait dans le navigateur ; renvoie juste l'ordre de déclencher.",
      inputSchema: z.object({}),
      // execute côté serveur = no-op ; la capture réelle est jouée par le client
      // (voir handleVoiceCommand → capturePhoto), comme start_timer.
      execute: async () => ({ capturing: true }),
    }),

    close_camera: tool({
      description:
        "Couper / éteindre la webcam (ex. « ferme la caméra », « coupe la caméra »). L'extinction se fait dans le navigateur ; renvoie juste l'ordre de couper.",
      inputSchema: z.object({}),
      // execute côté serveur = no-op ; l'extinction réelle est jouée par le client
      // (voir handleVoiceCommand → closeCamera).
      execute: async () => ({ closing: true }),
    }),

    start_timer: tool({
      description: "Démarrer un minuteur mains-libres (le décompte tourne dans le navigateur).",
      inputSchema: z.object({
        label: z.string().describe("nom du minuteur, ex. « hybridation »"),
        seconds: z.number().int().positive().describe("durée en secondes"),
      }),
      // execute côté serveur = no-op ; la charge est renvoyée au client qui lance
      // le vrai décompte (voir handleVoiceCommand → timers).
      execute: async ({ label, seconds }) => ({ started: true, label, seconds }),
    }),

    add_note: tool({
      description: "Enregistrer une note d'observation attachée à l'étape en cours.",
      inputSchema: z.object({ text: z.string().min(1) }),
      execute: async ({ text }) => {
        const ev = await captureNote(ctx.db, ctx.runId, await currentStepId(ctx), text, ctx.operator);
        return { saved: true, evidenceId: ev.id };
      },
    }),

    record_measurement: tool({
      description: "Enregistrer une mesure quantitative (avec son unité).",
      inputSchema: z.object({
        name: z.string().describe("ce qui est mesuré, ex. « Ct GAPDH »"),
        value: z.number(),
        unit: z.string().describe("unité, ex. Ct, °C, µL, ng/µL"),
        instrument: z.string().optional(),
      }),
      execute: async ({ name, value, unit, instrument }) => {
        const ev = await captureMeasurement(
          ctx.db,
          ctx.runId,
          await currentStepId(ctx),
          { name, value, unit, instrument },
          ctx.operator
        );
        return { saved: true, evidenceId: ev.id };
      },
    }),

    flag_deviation: tool({
      description:
        "Signaler une déviation par rapport au protocole (ce qui était prévu vs ce qui a été fait), avec un niveau de sévérité.",
      inputSchema: z.object({
        expected: z.string().describe("ce que le protocole prévoyait"),
        actual: z.string().describe("ce qui a réellement été fait"),
        severity: z.enum(["minor", "major", "critical"]),
        reason: z.string().optional(),
      }),
      execute: async ({ expected, actual, severity, reason }) => {
        const ev = await captureDeviation(
          ctx.db,
          ctx.runId,
          await currentStepId(ctx),
          { expected, actual, severity, reason },
          ctx.operator
        );
        return { saved: true, evidenceId: ev.id, severity };
      },
    }),

    query_memory: tool({
      description: "Rechercher dans la mémoire du labo (runs, protocoles, observations passés).",
      inputSchema: z.object({ query: z.string(), k: z.number().int().min(1).max(10).default(5) }),
      execute: async ({ query, k }) => {
        const hits = await search(ctx.db, ctx.ws, query, k);
        return { results: hits.map((h) => ({ id: h.sourceId, type: h.sourceType, text: h.text, score: Math.round(h.score * 100) / 100 })) };
      },
    }),
  };
}

export type VoiceTools = ReturnType<typeof buildVoiceTools>;
