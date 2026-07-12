"use client";

// Page « Protocol Library » — fenêtre `protocols`, ouverte par Bench → Protocols.
// Uniquement la liste des protocoles enregistrés + un raccourci vers la création
// (« New protocol », fenêtre `import`). La création elle-même vit dans
// NewProtocolClient (ouverte par le « + » de la Toolbar).
import { useWindowsContext } from "@/app/shell/WindowsContext";
import type { Protocol } from "@/lib/core/types";

export default function ProtocolsClient({ protocols }: { protocols: Protocol[] }) {
  const { open } = useWindowsContext();

  return (
    <div className="px-4 sm:px-8 py-10 max-w-3xl mx-auto w-full space-y-8">
      <header className="fade-in flex items-start justify-between gap-4">
        <div>
          <p className="eyebrow mb-3">Protocols</p>
          <h1 className="text-3xl font-semibold tracking-tight">Your protocol library</h1>
          <p className="text-base text-muted mt-3 max-w-xl" style={{ lineHeight: 1.6 }}>
            Every protocol here is a workflow you can activate. Open one to review it, or start a
            new one from a document or a short description.
          </p>
        </div>
        <button
          type="button"
          onClick={() => open("import")}
          className="btn-accent shrink-0 whitespace-nowrap"
        >
          + New protocol
        </button>
      </header>

      <section className="space-y-3">
        {protocols.length === 0 ? (
          <div className="card p-6 fade-up">
            <p className="text-muted text-sm">
              No protocol yet.{" "}
              <button
                type="button"
                onClick={() => open("import")}
                className="text-accent hover:underline"
              >
                Create your first one →
              </button>
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {protocols.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => open("protocol", { protocolId: p.id })}
                className="card card-hover block p-5 fade-up text-left w-full"
              >
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-medium leading-snug">{p.title}</h3>
                  <span className={`pill shrink-0 ${p.status === "published" ? "accent" : ""}`}>
                    {p.status}
                  </span>
                </div>
                <p className="receipt mt-2">
                  {p.steps.length} steps · {p.sources.length} sources · v{p.version}
                </p>
                {p.summary && (
                  <p className="text-[13px] text-muted mt-2 leading-snug">{p.summary}</p>
                )}
              </button>
            ))}
          </div>
        )}
      </section>

      <button
        type="button"
        onClick={() => open("bench-hub")}
        className="inline-block text-[14px] text-muted hover:text-foreground transition-colors"
      >
        ← Back to bench
      </button>
    </div>
  );
}
