"use client";
// Routeur de panneaux — un Window ne connaît que son win.kind ; c'est ici
// qu'on le mappe vers le composant réel. Deux pages protocoles distinctes :
// 'protocols' = la bibliothèque (liste), 'import' = la création (« New protocol »).
import type { Win } from "./useWindows";
import ChatClient from "@/app/chat/ChatClient";
import BenchHubPanel from "@/app/bench/BenchHubPanel";
import ProtocolsPanel from "@/app/bench/ProtocolsPanel";
import NewProtocolClient from "@/app/bench/NewProtocolClient";
import ProtocolPanel from "@/app/bench/ProtocolPanel";
import RunPanel from "@/app/bench/RunPanel";
import ReportEditor from "@/app/bench/ReportEditor";
import FilesPanel from "@/app/files/FilesPanel";
import McpPanel from "@/app/mcp/McpPanel";

export function WindowContent({ win }: { win: Win }) {
  switch (win.kind) {
    case "chat":
      return <ChatClient />;
    case "settings":
      return <div className="p-6 text-sm">Workspace: demo</div>;
    case "bench-hub":
      return <BenchHubPanel />;
    case "protocols":
      return <ProtocolsPanel />;
    case "import":
      return <NewProtocolClient />;
    case "protocol":
      return <ProtocolPanel pageId={win.params!.protocolId} />;
    case "run":
      return <RunPanel runId={win.params!.runId} />;
    case "report":
      return <ReportEditor runId={win.params!.runId} />;
    case "files":
      return <FilesPanel />;
    case "mcp":
      return <McpPanel />;
    default:
      return <div className="p-6 text-sm opacity-60">Coming soon: {win.kind}</div>;
  }
}
