// Raccourcis Markdown : on tape la syntaxe directement dans la page (sans
// passer par le menu "/") et le bloc se transforme tout seul.
//
// Les titres (#), listes (-, 1.), citations (>), blocs de code (```) et le
// trait de séparation (---) sont déjà gérés nativement par StarterKit. Cette
// extension ajoute ce qui manquait : la checklist et le lien.

import { Extension, InputRule } from "@tiptap/core";

export const MarkdownShortcuts = Extension.create({
  name: "markdownShortcuts",

  addInputRules() {
    return [
      // "[] ", "[ ] " ou "[x] " en début de ligne -> checklist.
      new InputRule({
        find: /^\[( |x|X)?\]\s$/,
        handler: ({ range, chain }) => {
          chain().deleteRange(range).toggleTaskList().run();
        },
      }),
      // "[texte](https://…) " -> lien cliquable sur "texte".
      new InputRule({
        find: /\[([^\]]+)\]\(([^)\s]+)\)\s$/,
        handler: ({ range, match, chain }) => {
          const text = match[1];
          const href = match[2];
          chain()
            .deleteRange(range)
            .insertContent([
              {
                type: "text",
                text,
                marks: [{ type: "link", attrs: { href } }],
              },
              { type: "text", text: " " },
            ])
            .run();
        },
      }),
    ];
  },
});
