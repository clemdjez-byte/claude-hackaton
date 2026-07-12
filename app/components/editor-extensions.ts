// Jeu d'extensions TipTap commun aux éditeurs de l'app (protocoles pour
// l'instant). Centralisé ici pour qu'ils aient tous exactement les mêmes
// capacités de mise en page.

import StarterKit from "@tiptap/starter-kit";
import Typography from "@tiptap/extension-typography";
import { TableKit } from "@tiptap/extension-table";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { MarkdownShortcuts } from "./MarkdownShortcuts";
import { SlashCommand } from "./SlashCommand";

export const baseExtensions = [
  // StarterKit v3 inclut déjà Link : on le configure ici plutôt que d'en
  // ajouter un second (sinon Tiptap signale un doublon d'extension).
  StarterKit.configure({
    link: {
      openOnClick: false,
      autolink: true,
      HTMLAttributes: { rel: "noreferrer noopener", target: "_blank" },
    },
  }),
  Typography,
  TableKit.configure({
    table: { allowTableNodeSelection: true, resizable: true },
  }),
  TaskList,
  TaskItem.configure({ nested: true }),
  SlashCommand,
  MarkdownShortcuts,
];
