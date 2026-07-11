"use client";
// Routeur de panneaux — un Window ne connaît que son win.kind ; c'est ici
// qu'on le mappe vers le composant réel. Tasks 7-8 branchent bench-hub,
// protocols, protocol, run, report, files, import ; en attendant ils tombent
// sur le placeholder "Coming soon".
import type { Win } from "./useWindows";
import ChatClient from "@/app/chat/ChatClient";

export function WindowContent({ win }: { win: Win }) {
  switch (win.kind) {
    case "chat":
      return <ChatClient />;
    case "settings":
      return <div className="p-6 text-sm">Workspace: demo</div>;
    // 'import', 'bench-hub', 'protocols', 'protocol', 'run', 'report', 'files' → branchés Tasks 7-8
    default:
      return <div className="p-6 text-sm opacity-60">Coming soon: {win.kind}</div>;
  }
}
