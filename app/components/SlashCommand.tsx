"use client";

// Slash command menu: typing "/" in a Tiptap editor opens a dropdown of
// block types to insert. Self-contained extension — add it to an editor's
// `extensions` array to enable it.

import { Extension, type Editor, type Range } from "@tiptap/core";
import { Suggestion } from "@tiptap/suggestion";
import { ReactRenderer } from "@tiptap/react";
import { useEffect, useRef, useState } from "react";

type SlashItem = {
  title: string;
  hint: string;
  keywords: string[];
  run: (editor: Editor, range: Range) => void;
};

type TableSize = {
  rows: number;
  cols: number;
  withHeaderRow: boolean;
};

type TableSizePickerProps = {
  onCancel: () => void;
  onPick: (size: TableSize) => void;
};

const MIN_TABLE_SIZE = 1;
const MAX_TABLE_INPUT_SIZE = 20;
const TABLE_PICKER_ROWS = 8;
const TABLE_PICKER_COLS = 10;

function clampTableSize(value: number): number {
  if (Number.isNaN(value)) return MIN_TABLE_SIZE;
  return Math.min(MAX_TABLE_INPUT_SIZE, Math.max(MIN_TABLE_SIZE, value));
}

function TableSizePicker({ onCancel, onPick }: TableSizePickerProps) {
  const [rows, setRows] = useState(3);
  const [cols, setCols] = useState(3);
  const [withHeaderRow, setWithHeaderRow] = useState(true);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
      }
      if (event.key === "Enter") {
        event.preventDefault();
        onPick({ rows, cols, withHeaderRow });
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [cols, onCancel, onPick, rows, withHeaderRow]);

  return (
    <div className="w-[246px] rounded-lg border border-border bg-surface p-3 shadow-lg">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[12px] font-medium text-ink-soft">
          {rows} rows x {cols} columns
        </span>
        <label className="flex items-center gap-1.5 text-[11px] text-muted">
          <input
            type="checkbox"
            checked={withHeaderRow}
            onChange={(event) => setWithHeaderRow(event.currentTarget.checked)}
            className="h-3.5 w-3.5 accent-[var(--accent)]"
          />
          Header row
        </label>
      </div>

      <div
        className="grid gap-1"
        style={{
          gridTemplateColumns: `repeat(${TABLE_PICKER_COLS}, 1.125rem)`,
        }}
      >
        {Array.from({ length: TABLE_PICKER_ROWS }).map((_, rowIndex) =>
          Array.from({ length: TABLE_PICKER_COLS }).map((__, colIndex) => {
            const cellRows = rowIndex + 1;
            const cellCols = colIndex + 1;
            const selected = cellRows <= rows && cellCols <= cols;

            return (
              <button
                key={`${cellRows}-${cellCols}`}
                type="button"
                aria-label={`${cellRows} rows, ${cellCols} columns`}
                className={`h-[1.125rem] w-[1.125rem] rounded-[3px] border ${
                  selected
                    ? "border-accent bg-accent-soft"
                    : "border-border bg-background hover:border-accent"
                }`}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => {
                  setRows(cellRows);
                  setCols(cellCols);
                }}
                onFocus={() => {
                  setRows(cellRows);
                  setCols(cellCols);
                }}
                onClick={() =>
                  onPick({ rows: cellRows, cols: cellCols, withHeaderRow })
                }
              />
            );
          }),
        )}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <label className="text-[11px] text-muted">
          Rows
          <input
            type="number"
            min={MIN_TABLE_SIZE}
            max={MAX_TABLE_INPUT_SIZE}
            value={rows}
            onChange={(event) =>
              setRows(clampTableSize(Number(event.currentTarget.value)))
            }
            className="mt-1 h-8 w-full rounded-md border border-border bg-background px-2 text-[13px] text-ink-soft focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </label>
        <label className="text-[11px] text-muted">
          Columns
          <input
            type="number"
            min={MIN_TABLE_SIZE}
            max={MAX_TABLE_INPUT_SIZE}
            value={cols}
            onChange={(event) =>
              setCols(clampTableSize(Number(event.currentTarget.value)))
            }
            className="mt-1 h-8 w-full rounded-md border border-border bg-background px-2 text-[13px] text-ink-soft focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </label>
      </div>

      <button
        type="button"
        className="mt-3 h-8 w-full rounded-md bg-accent text-[12px] font-medium text-white hover:opacity-90"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => onPick({ rows, cols, withHeaderRow })}
      >
        Insert table
      </button>
    </div>
  );
}

function openTableSizePicker(editor: Editor, range: Range) {
  const coords = editor.view.coordsAtPos(range.from);

  editor.chain().focus().deleteRange(range).run();

  let renderer: ReactRenderer<unknown, TableSizePickerProps> | null = null;
  let closed = false;

  function close() {
    closed = true;
    document.removeEventListener("mousedown", handlePointerDown);
    renderer?.element.remove();
    renderer?.destroy();
    renderer = null;
  }

  function handlePointerDown(event: MouseEvent) {
    const element = renderer?.element as HTMLElement | undefined;
    if (element && !element.contains(event.target as Node)) close();
  }

  function place(element: HTMLElement) {
    const width = element.offsetWidth || 246;
    const height = element.offsetHeight || 320;
    const left = Math.min(
      Math.max(8, coords.left),
      Math.max(8, window.innerWidth - width - 8),
    );
    const top =
      coords.bottom + 8 + height <= window.innerHeight
        ? coords.bottom + 8
        : Math.max(8, coords.top - height - 8);

    element.style.position = "fixed";
    element.style.zIndex = "80";
    element.style.left = `${left}px`;
    element.style.top = `${top}px`;
  }

  renderer = new ReactRenderer(TableSizePicker, {
    props: {
      onCancel: close,
      onPick: (size: TableSize) => {
        close();
        editor
          .chain()
          .focus()
          .insertTable({
            rows: size.rows,
            cols: size.cols,
            withHeaderRow: size.withHeaderRow,
          })
          .run();
      },
    },
    editor,
  });

  const element = renderer.element as HTMLElement;
  document.body.appendChild(element);
  place(element);
  window.setTimeout(() => {
    if (!closed) document.addEventListener("mousedown", handlePointerDown);
  }, 0);
}

const ITEMS: SlashItem[] = [
  {
    title: "Normal text",
    hint: "¶",
    keywords: ["text", "paragraph", "normal"],
    run: (e, r) => e.chain().focus().deleteRange(r).setParagraph().run(),
  },
  {
    title: "Heading 1",
    hint: "#",
    keywords: ["heading", "h1", "title", "big"],
    run: (e, r) =>
      e.chain().focus().deleteRange(r).toggleHeading({ level: 1 }).run(),
  },
  {
    title: "Heading 2",
    hint: "##",
    keywords: ["heading", "h2", "title", "subtitle"],
    run: (e, r) =>
      e.chain().focus().deleteRange(r).toggleHeading({ level: 2 }).run(),
  },
  {
    title: "Heading 3",
    hint: "###",
    keywords: ["heading", "h3", "title"],
    run: (e, r) =>
      e.chain().focus().deleteRange(r).toggleHeading({ level: 3 }).run(),
  },
  {
    title: "Bullet list",
    hint: "-",
    keywords: ["list", "bullet", "unordered"],
    run: (e, r) => e.chain().focus().deleteRange(r).toggleBulletList().run(),
  },
  {
    title: "Numbered list",
    hint: "1.",
    keywords: ["list", "ordered", "number"],
    run: (e, r) => e.chain().focus().deleteRange(r).toggleOrderedList().run(),
  },
  {
    title: "Checklist",
    hint: "[ ]",
    keywords: ["task", "todo", "checkbox", "checklist"],
    run: (e, r) => e.chain().focus().deleteRange(r).toggleTaskList().run(),
  },
  {
    title: "Quote",
    hint: ">",
    keywords: ["quote", "blockquote", "citation"],
    run: (e, r) => e.chain().focus().deleteRange(r).toggleBlockquote().run(),
  },
  {
    title: "Code block",
    hint: "```",
    keywords: ["code", "block", "pre"],
    run: (e, r) => e.chain().focus().deleteRange(r).toggleCodeBlock().run(),
  },
  {
    title: "Divider",
    hint: "---",
    keywords: ["divider", "separator", "line", "hr", "rule"],
    run: (e, r) => e.chain().focus().deleteRange(r).setHorizontalRule().run(),
  },
  {
    title: "Table",
    hint: "| |",
    keywords: ["table", "grid"],
    run: (e, r) => openTableSizePicker(e, r),
  },
];

function filterItems(query: string): SlashItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return ITEMS;
  return ITEMS.filter(
    (it) =>
      it.title.toLowerCase().includes(q) ||
      it.keywords.some((k) => k.includes(q)),
  );
}

type MenuProps = {
  items: SlashItem[];
  selected: number;
  onPick: (index: number) => void;
};

// Purely presentational: it displays, it does not decide. Keyboard
// selection and the actual pick are driven by the extension below.
function SlashMenu({ items, selected, onPick }: MenuProps) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const selectedItemRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const menu = menuRef.current;
    const item = selectedItemRef.current;
    if (!menu || !item) return;

    const itemTop = item.offsetTop;
    const itemBottom = itemTop + item.offsetHeight;
    const visibleTop = menu.scrollTop;
    const visibleBottom = visibleTop + menu.clientHeight;

    if (itemTop < visibleTop) {
      menu.scrollTop = itemTop;
    } else if (itemBottom > visibleBottom) {
      menu.scrollTop = itemBottom - menu.clientHeight;
    }
  }, [items.length, selected]);

  if (items.length === 0) {
    return (
      <div className="w-60 rounded-lg border border-border bg-surface px-3 py-2 text-[13px] text-muted shadow-lg">
        No blocks
      </div>
    );
  }

  return (
    <div
      ref={menuRef}
      className="w-60 max-h-72 overflow-y-auto rounded-lg border border-border bg-surface py-1 shadow-lg"
    >
      {items.map((it, i) => (
        <button
          key={it.title}
          ref={i === selected ? selectedItemRef : null}
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            onPick(i);
          }}
          className={`flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left text-[13px] cursor-pointer ${
            i === selected ? "bg-accent-soft" : "hover:bg-surface-2"
          }`}
        >
          <span className="text-ink-soft">{it.title}</span>
          <span className="mono-display text-[11px] text-muted">{it.hint}</span>
        </button>
      ))}
    </div>
  );
}

export const SlashCommand = Extension.create({
  name: "slashCommand",

  addProseMirrorPlugins() {
    return [
      Suggestion<SlashItem>({
        editor: this.editor,
        char: "/",
        allowSpaces: false,
        command: ({ editor, range, props }) => {
          props.run(editor, range);
        },
        items: ({ query }) => filterItems(query),
        render: () => {
          let renderer: ReactRenderer<unknown, MenuProps> | null = null;
          let items: SlashItem[] = [];
          let pick: (item: SlashItem) => void = () => {};
          let selected = 0;
          let dismissed = false;

          function onPick(index: number) {
            const it = items[index];
            if (it) pick(it);
          }

          function paint() {
            renderer?.updateProps({ items, selected, onPick });
          }

          function place(clientRect?: (() => DOMRect | null) | null) {
            if (!renderer) return;
            const el = renderer.element as HTMLElement;
            const rect = clientRect?.();
            if (!rect || dismissed) {
              el.style.display = "none";
              return;
            }
            el.style.display = "";
            const menuH = el.offsetHeight || 280;
            const below = rect.bottom + 6;
            const fitsBelow = below + menuH <= window.innerHeight;
            el.style.top = `${fitsBelow ? below : Math.max(8, rect.top - 6 - menuH)}px`;
            el.style.left = `${rect.left}px`;
          }

          return {
            onStart: (props) => {
              dismissed = false;
              selected = 0;
              items = props.items;
              pick = props.command;
              renderer = new ReactRenderer(SlashMenu, {
                props: { items, selected, onPick },
                editor: props.editor,
              });
              const el = renderer.element as HTMLElement;
              el.style.position = "fixed";
              el.style.zIndex = "60";
              document.body.appendChild(el);
              place(props.clientRect);
            },
            onUpdate: (props) => {
              items = props.items;
              pick = props.command;
              if (selected >= items.length) selected = 0;
              paint();
              place(props.clientRect);
            },
            onKeyDown: (props) => {
              if (dismissed) return false;
              const key = props.event.key;
              if (key === "Escape") {
                dismissed = true;
                if (renderer) {
                  (renderer.element as HTMLElement).style.display = "none";
                }
                return true;
              }
              if (items.length === 0) return false;
              if (key === "ArrowDown") {
                selected = (selected + 1) % items.length;
                paint();
                return true;
              }
              if (key === "ArrowUp") {
                selected = (selected - 1 + items.length) % items.length;
                paint();
                return true;
              }
              if (key === "Enter") {
                onPick(selected);
                return true;
              }
              return false;
            },
            onExit: () => {
              renderer?.element.remove();
              renderer?.destroy();
              renderer = null;
            },
          };
        },
      }),
    ];
  },
});
