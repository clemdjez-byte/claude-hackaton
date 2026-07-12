// Types partagés par app/api/files/* (producteurs) et app/files/FilesPanel.tsx
// (consommateur) — évite des déclarations divergentes du même shape.
export type PageMeta = {
  id: string;
  title: string;
  createdAt: string;
  type: string;
  runId?: string;
  folderId?: string | null;
};

export type FolderMeta = { id: string; name: string; parentId: string | null };
