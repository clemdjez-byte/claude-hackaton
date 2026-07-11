// Le TYPE du node Tiptap « étape ». Constante isolée (aucune dépendance) pour
// être partagée entre le sérialiseur pur (doc.ts, côté serveur) et le node
// Tiptap (protocol-step-node.tsx, côté client) sans traîner zod dans le bundle.
export const PROTOCOL_STEP_NODE = "protocolStep";
