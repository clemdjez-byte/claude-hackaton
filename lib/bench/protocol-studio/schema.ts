// features/protocol-studio/schema.ts — schémas Zod pour ce que le LLM produit.
// La validation se fait au niveau de l'outil (generateObject) → le modèle réessaie
// si la structure ne colle pas. Zéro JSON à parser à la main.
import { z } from "zod";

export const QuantitySchema = z.object({ value: z.number(), unit: z.string() });

export const MaterialSchema = z.object({
  name: z.string(),
  role: z.enum(["reagent", "consumable", "equipment"]),
  stockConc: QuantitySchema.optional(),
});

export const RecipeComponentSchema = z.object({
  name: z.string(),
  perReaction: QuantitySchema,
  perWell: z
    .boolean()
    .optional()
    .describe("true = ajouté puits par puits (ex. template) → exclu de l'excès de pipetage partagé"),
});

export const ProtocolStepSchema = z.object({
  index: z.number().int(),
  title: z.string(),
  instruction: z.string(),
  durationSec: z.number().int().positive().optional().describe("timer suggéré en secondes"),
  temperature: QuantitySchema.optional(),
  critical: z.boolean().optional().describe("true si une déviation à cette étape compromet le résultat"),
  isResult: z
    .boolean()
    .optional()
    .describe("réservé au système : ne pas renseigner ; une étape finale « Results » est ajoutée automatiquement"),
});

export const ParamDefSchema = z.object({
  key: z.string().describe("clé machine, ex. n_reactions"),
  label: z.string(),
  default: z.number().optional(),
  unit: z.string(),
});

export const SourceRefSchema = z.object({
  kind: z.enum(["doi", "url", "evidence", "sop"]),
  ref: z.string(),
  label: z.string().optional(),
});

export const ProtocolDraftSchema = z.object({
  title: z.string(),
  summary: z.string().optional(),
  materials: z.array(MaterialSchema),
  steps: z.array(ProtocolStepSchema),
  parameters: z.array(ParamDefSchema),
  recipe: z
    .object({
      name: z.string(),
      components: z.array(RecipeComponentSchema),
      finalVolumePerReaction: QuantitySchema.optional(),
    })
    .optional()
    .describe("recette scalable (master mix) — les volumes sont PAR RÉACTION, le scaling est fait par du code déterministe, jamais par toi"),
  sources: z.array(SourceRefSchema).describe("citations obligatoires — aucune affirmation sans source"),
});

export type ProtocolDraft = z.infer<typeof ProtocolDraftSchema>;
