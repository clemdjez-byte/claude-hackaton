"use client";
// app/chat/ConversationSidebar.tsx
// Colonne gauche de la fenêtre de chat : nouvelle discussion, liste des
// conversations (cliquables + supprimables), repliable pour rendre la place.
import type { Conversation } from "./types";

export default function ConversationSidebar({
  conversations,
  activeId,
  onSelect,
  onCreate,
  onRemove,
  collapsed,
  onToggle,
}: {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onRemove: (id: string) => void;
  collapsed: boolean;
  onToggle: () => void;
}) {
  if (collapsed) {
    return (
      <button type="button" className="conv-reopen" onClick={onToggle} title="Show history" aria-label="Show history">
        ☰
      </button>
    );
  }
  return (
    <aside className="conv-sidebar">
      <div className="conv-head">
        <button type="button" className="conv-new" onClick={onCreate}>+ New discussion</button>
        <button type="button" className="conv-collapse" onClick={onToggle} title="Hide history" aria-label="Hide history">
          ‹
        </button>
      </div>
      <div className="conv-label">Discussions</div>
      <ul className="conv-list">
        {conversations.map((c) => (
          <li key={c.id} className={`conv-item${c.id === activeId ? " is-active" : ""}`}>
            <button type="button" className="conv-open" onClick={() => onSelect(c.id)} title={c.title}>
              {c.title}
            </button>
            <button
              type="button"
              className="conv-del"
              onClick={() => onRemove(c.id)}
              title="Delete discussion"
              aria-label="Delete discussion"
            >
              🗑
            </button>
          </li>
        ))}
        {conversations.length === 0 && <li className="conv-empty">No discussions yet.</li>}
      </ul>
    </aside>
  );
}
