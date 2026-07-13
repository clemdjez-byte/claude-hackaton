// lib/bench/voice-copilot/tools.ts — les « bras » de l'agent.
// Chaque outil délègue à une brique via son interface publique. Le start_timer
// n'a PAS d'execute : il est joué côté navigateur (onToolCall + addToolResult).
import { tool } from "ai";
import { z } from "zod";
import type { Db, Evidence, Id, Ws } from "@/lib/core";
import { advanceStep, skipStep, stepBack, getRunContext } from "../live-bench";
import {
  captureNote,
  captureMeasurement,
  captureDeviation,
  deleteEvidence,
  listEvidence,
} from "../evidence-capture";
import { search } from "@/lib/retrieval";
import { hitsToAnchors, collectGraphBlock } from "@/lib/retrieval/knowledge-graph/query";

// La réponse de query_memory est LUE à voix haute : on tronque bien plus serré
// que le chat écrit (1200), pour éviter que l'agent récite des pavés.
const VOICE_HIT_CHARS = 320;

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

/** Résumé lisible d'une preuve, pour que l'agent puisse la citer/la choisir. */
function describeEvidence(e: Evidence): string {
  if (e.kind === "measurement" && e.measurement)
    return e.body ?? `${e.measurement.value} ${e.measurement.unit}`;
  if (e.kind === "deviation" && e.deviation)
    return `[${e.deviation.severity}] «${e.deviation.expected}» → «${e.deviation.actual}»`;
  if (e.kind === "photo") return e.body ? `photo : ${e.body}` : "photo";
  if (e.kind === "data") return `fichier : ${e.source?.label ?? e.body ?? "données"}`;
  return e.body ?? e.kind;
}

/** Construit les outils de l'agent pour un run donné (closures sur db/runId). */
export function buildVoiceTools(ctx: VoiceToolCtx) {
  return {
    next_step: tool({
      description: "Passer à l'étape suivante du run (clôt l'étape en cours, active la suivante).",
      inputSchema: z.object({}),
      execute: async () => {
        const { justCompleted, active } = await advanceStep(ctx.db, ctx.runId);
        // index en base 1 (comme l'UI) — jamais d'« étape 0 » pour l'agent.
        return {
          completed: justCompleted ? { index: justCompleted.protocolStepIndex + 1, title: justCompleted.title } : null,
          active: active ? { index: active.protocolStepIndex + 1, title: active.title } : null,
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
        return { skipped: true, step: { index: s.protocolStepIndex + 1, title: s.title } };
      },
    }),

    step_back: tool({
      description: "Reculer d'une étape (annuler une avance : l'étape précédente redevient l'étape en cours).",
      inputSchema: z.object({}),
      execute: async () => {
        const { active } = await stepBack(ctx.db, ctx.runId);
        return { active: active ? { index: active.protocolStepIndex + 1, title: active.title } : null };
      },
    }),

    read_step: tool({
      description:
        "Lire/consulter le détail d'une étape (passée, courante ou future) SANS la modifier ni avancer. À utiliser quand l'opérateur veut juste voir ce que contient une étape.",
      inputSchema: z.object({
        index: z.number().int().describe("numéro de l'étape à consulter (1 = première)"),
      }),
      // Lecture seule : n'est PAS dans MUTATING_TOOLS (voice-agent/tools.ts) → ne
      // déclenche aucune resynchro ni validation. C'est le point-clé : montrer une
      // étape sans marquer les précédentes comme faites.
      execute: async ({ index }) => {
        const rc = await getRunContext(ctx.db, ctx.runId);
        const zeroBased = index - 1; // l'agent numérote en base 1 (comme l'UI)
        const proto = rc?.protocol.steps.find((p) => p.index === zeroBased);
        if (!proto) return { found: false, index };
        const runStep = rc?.steps.find((s) => s.protocolStepIndex === zeroBased);
        return {
          index,
          title: proto.title,
          instruction: proto.instruction,
          status: runStep?.status ?? "pending",
          critical: proto.critical ?? false,
        };
      },
    }),

    list_evidence: tool({
      description:
        "Lister les preuves déjà consignées de ce run (notes, mesures, déviations, photos, fichiers) avec leur id — indispensable avant de supprimer ou corriger une preuve, ou pour rappeler ce qui a été capturé.",
      inputSchema: z.object({
        kind: z
          .enum(["note", "measurement", "deviation", "photo", "data"])
          .optional()
          .describe("filtrer par nature (optionnel)"),
      }),
      // Lecture seule → PAS dans MUTATING_TOOLS.
      execute: async ({ kind }) => {
        const items = await listEvidence(ctx.db, ctx.runId, kind ? { kind } : undefined);
        return {
          count: items.length,
          // Plus récente en premier (comme le journal à l'écran).
          evidence: [...items].reverse().map((e) => ({
            id: e.id,
            kind: e.kind,
            summary: describeEvidence(e),
          })),
        };
      },
    }),

    delete_evidence: tool({
      description:
        "Supprimer définitivement une preuve du journal (note, mesure, déviation, photo ou fichier). Récupère d'abord son id via list_evidence, et confirme oralement avec l'opérateur avant de supprimer.",
      inputSchema: z.object({
        id: z.string().describe("id de la preuve à supprimer (obtenu via list_evidence)"),
      }),
      execute: async ({ id }) => {
        const removed = await deleteEvidence(ctx.db, id);
        if (!removed) return { deleted: false, reason: "preuve introuvable" };
        return { deleted: true, kind: removed.kind, was: describeEvidence(removed) };
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
      description:
        "Demander au labo : cherche dans la mémoire (runs, protocoles, observations passés) ET dans le graphe de connaissances (verdicts, causes d'échec documentées, recoupements entre protocoles). À utiliser pour les questions réflexives : « quelles conséquences si je me trompe ? », « comment se sont passées les manips précédentes ? ».",
      inputSchema: z.object({ query: z.string(), k: z.number().int().min(1).max(10).default(5) }),
      execute: async ({ query, k }) => {
        const hits = await search(ctx.db, ctx.ws, query, k);
        const results = hits.map((h) => ({
          id: h.sourceId,
          type: h.sourceType,
          text: h.text.slice(0, VOICE_HIT_CHARS),
        }));
        // Voie graphe : best-effort. Un flag désactivé (assertEnabled) ou toute
        // erreur graphe NE DOIT PAS casser le tour vocal : on renvoie alors juste
        // les passages RAG.
        let graph = "";
        try {
          const anchors = hitsToAnchors(hits);
          graph = (await collectGraphBlock(ctx.db, ctx.ws, anchors)).graphBlock;
        } catch (e) {
          console.warn("[voice] collecte graphe échouée (best-effort) :", e);
        }
        return graph ? { results, graph } : { results };
      },
    }),
  };
}

export type VoiceTools = ReturnType<typeof buildVoiceTools>;
