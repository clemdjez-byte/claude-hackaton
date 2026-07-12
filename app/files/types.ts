// Type partagé par app/api/files/route.ts (producteur) et app/files/FilesPanel.tsx
// (consommateur) — évite deux déclarations divergentes du même shape.
export type PageMeta = { id: string; title: string; createdAt: string; type: string; runId?: string };
