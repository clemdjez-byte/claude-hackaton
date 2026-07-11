import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center px-6 py-16">
      <p className="eyebrow">Octopus — wet lab OS</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
        From protocol to auditable report, by voice.
      </h1>
      <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-muted">
        The augmented scientist with eight arms — versioned protocols, a guided bench,
        captured evidence, and a report that feeds the lab&apos;s memory.
      </p>

      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        <Link href="/bench/protocols" className="card card-hover block p-5">
          <p className="eyebrow">Bench</p>
          <p className="mt-2 text-lg font-medium text-foreground">Open the bench →</p>
          <p className="mt-1 text-sm text-muted">Protocols, guided runs, evidence, reports.</p>
        </Link>
        <Link href="/chat" className="card card-hover block p-5">
          <p className="eyebrow">Ask your lab</p>
          <p className="mt-2 text-lg font-medium text-foreground">Query the memory →</p>
          <p className="mt-1 text-sm text-muted">Ask a question, get sourced answers.</p>
        </Link>
      </div>
    </main>
  );
}
