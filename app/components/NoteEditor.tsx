"use client";

// Éditeur de notes de l'app. Les éditeurs riches (protocoles pour l'instant)
// s'appuient sur ce composant : même mise en page, mêmes extensions. Les
// éditeurs spécifiques ne font qu'ajouter leur propre habillage autour de lui
// (barre d'outils, autosave, titre…).

import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import type { JSONContent, Content, Extensions } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";
import { useEffect, useRef, useState } from "react";
import { baseExtensions } from "./editor-extensions";

type Props = {
  initialContent: Content; // string (HTML/markdown) ou JSON Tiptap (protocole)
  editable?: boolean;
  autofocus?: boolean;
  className?: string;
  editorClassName?: string;
  onChange?: (html: string, json: JSONContent) => void;
  // Donne accès à l'instance Tiptap au parent (barre d'outils, sauvegarde…).
  onReady?: (editor: Editor) => void;
  // Extensions Tiptap supplémentaires ajoutées APRÈS baseExtensions (ex. le node
  // « étape » de l'éditeur de protocole). N'affecte pas les autres éditeurs.
  extraExtensions?: Extensions;
};

type TableToolbarState =
  | { visible: false }
  | {
      visible: true;
      left: number;
      top: number;
      selectedWholeTable: boolean;
    };

function getCurrentTablePos(editor: Editor): number | null {
  const { selection } = editor.state;

  if (selection instanceof NodeSelection && selection.node.type.name === "table") {
    return selection.from;
  }

  for (let depth = selection.$from.depth; depth > 0; depth -= 1) {
    if (selection.$from.node(depth).type.name === "table") {
      return selection.$from.before(depth);
    }
  }

  return null;
}

function getTableRect(editor: Editor, tablePos: number): DOMRect | null {
  const node = editor.view.nodeDOM(tablePos);
  if (!(node instanceof HTMLElement)) return null;

  const wrapper = node.classList.contains("tableWrapper")
    ? node
    : (node.closest(".tableWrapper") as HTMLElement | null);

  return (wrapper ?? node).getBoundingClientRect();
}

function selectCurrentTable(editor: Editor): boolean {
  const tablePos = getCurrentTablePos(editor);
  if (tablePos === null) return false;

  const tr = editor.state.tr
    .setSelection(NodeSelection.create(editor.state.doc, tablePos))
    .scrollIntoView();
  editor.view.dispatch(tr);
  editor.view.focus();
  return true;
}

function deleteCurrentTable(editor: Editor): boolean {
  const { selection } = editor.state;

  if (selection instanceof NodeSelection && selection.node.type.name === "table") {
    editor.view.dispatch(editor.state.tr.delete(selection.from, selection.to));
    editor.view.focus();
    return true;
  }

  return editor.chain().focus().deleteTable().run();
}

const tableToolButtonClass =
  "h-7 shrink-0 rounded-md border border-border bg-surface px-2 text-[12px] text-ink-soft hover:bg-surface-2 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-45";

function TableToolbar({ editor }: { editor: Editor | null }) {
  const [state, setState] = useState<TableToolbarState>({ visible: false });

  useEffect(() => {
    if (!editor) return;

    const currentEditor = editor;
    let frame: number | null = null;

    function update() {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (!currentEditor.isEditable) {
          setState({ visible: false });
          return;
        }

        const tablePos = getCurrentTablePos(currentEditor);
        if (tablePos === null) {
          setState({ visible: false });
          return;
        }

        const rect = getTableRect(currentEditor, tablePos);
        const caret = currentEditor.view.coordsAtPos(
          currentEditor.state.selection.from,
        );
        const topSource = rect ?? caret;
        const toolbarWidth = 660;
        const left = Math.min(
          Math.max(8, topSource.left),
          Math.max(8, window.innerWidth - toolbarWidth - 8),
        );
        const top =
          topSource.top > 48
            ? topSource.top - 42
            : Math.min(window.innerHeight - 44, topSource.bottom + 8);

        const { selection } = currentEditor.state;
        setState({
          visible: true,
          left,
          top: Math.max(8, top),
          selectedWholeTable:
            selection instanceof NodeSelection &&
            selection.node.type.name === "table",
        });
      });
    }

    update();
    currentEditor.on("selectionUpdate", update);
    currentEditor.on("transaction", update);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);

    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
      currentEditor.off("selectionUpdate", update);
      currentEditor.off("transaction", update);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [editor]);

  if (!editor || !state.visible) return null;

  function run(command: () => boolean) {
    command();
  }

  return (
    <div
      className="fixed z-[70] flex max-w-[calc(100vw-16px)] items-center gap-1 overflow-x-auto rounded-lg border border-border bg-background/95 px-1.5 py-1 shadow-lg backdrop-blur"
      style={{ left: state.left, top: state.top }}
      onMouseDown={(event) => event.preventDefault()}
    >
      <span className="shrink-0 px-1.5 text-[11px] font-medium text-muted">
        Table
      </span>
      <button
        type="button"
        title="Add a column before"
        className={tableToolButtonClass}
        onClick={() => run(() => editor.chain().focus().addColumnBefore().run())}
      >
        + Col before
      </button>
      <button
        type="button"
        title="Add a column after"
        className={tableToolButtonClass}
        onClick={() => run(() => editor.chain().focus().addColumnAfter().run())}
      >
        + Col after
      </button>
      <button
        type="button"
        title="Delete column"
        className={tableToolButtonClass}
        onClick={() => run(() => editor.chain().focus().deleteColumn().run())}
      >
        - Col
      </button>
      <span className="mx-1 h-4 w-px shrink-0 bg-border" aria-hidden />
      <button
        type="button"
        title="Add a row above"
        className={tableToolButtonClass}
        onClick={() => run(() => editor.chain().focus().addRowBefore().run())}
      >
        + Row above
      </button>
      <button
        type="button"
        title="Add a row below"
        className={tableToolButtonClass}
        onClick={() => run(() => editor.chain().focus().addRowAfter().run())}
      >
        + Row below
      </button>
      <button
        type="button"
        title="Delete row"
        className={tableToolButtonClass}
        onClick={() => run(() => editor.chain().focus().deleteRow().run())}
      >
        - Row
      </button>
      <span className="mx-1 h-4 w-px shrink-0 bg-border" aria-hidden />
      <button
        type="button"
        title="Select the whole table"
        className={`${tableToolButtonClass} ${
          state.selectedWholeTable ? "border-accent text-accent" : ""
        }`}
        onClick={() => run(() => selectCurrentTable(editor))}
      >
        Select table
      </button>
      <button
        type="button"
        title="Delete table"
        className={`${tableToolButtonClass} border-danger/50 text-danger hover:bg-danger/10 hover:text-danger`}
        onClick={() => run(() => deleteCurrentTable(editor))}
      >
        Delete
      </button>
    </div>
  );
}

export function NoteEditor({
  initialContent,
  editable = true,
  autofocus = false,
  className,
  editorClassName = "focus:outline-none min-h-[200px]",
  onChange,
  onReady,
  extraExtensions,
}: Props) {
  const onReadyRef = useRef(onReady);
  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  const editor = useEditor({
    extensions: [...baseExtensions, ...(extraExtensions ?? [])],
    content: initialContent,
    editable,
    autofocus,
    immediatelyRender: false,
    onUpdate({ editor }) {
      onChange?.(editor.getHTML(), editor.getJSON());
    },
    editorProps: {
      attributes: { class: editorClassName },
    },
  });

  useEffect(() => {
    if (editor) onReadyRef.current?.(editor);
  }, [editor]);

  return (
    <div className={className}>
      <EditorContent editor={editor} />
      {editable && <TableToolbar editor={editor} />}
    </div>
  );
}
