"use client";

// Client mobile : deux inputs file natifs (appareil photo / photothèque) — pas
// de getUserMedia, qui exigerait HTTPS hors localhost alors qu'on sert en HTTP
// sur le LAN. L'accept JPEG/PNG/WebP force iOS à convertir ses HEIC en JPEG.
// Chaque photo part immédiatement ; la page reste ouverte pour enchaîner.
import { useRef, useState } from "react";

const ACCEPT = "image/jpeg,image/png,image/webp";
const MAX_BYTES = 20 * 1024 * 1024;
const MAX_PHOTOS = 10;

export default function PhoneUploadClient({
  channelId,
  token,
}: {
  channelId: string;
  token: string;
}) {
  const [count, setCount] = useState(0);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const cameraRef = useRef<HTMLInputElement | null>(null);
  const libraryRef = useRef<HTMLInputElement | null>(null);

  async function send(list: FileList | null) {
    const files = Array.from(list ?? []);
    if (files.length === 0) return;
    setError(null);
    setSending(true);
    try {
      for (const file of files) {
        if (!ACCEPT.split(",").includes(file.type)) {
          setError("Photos only (JPG, PNG, WebP).");
          continue;
        }
        if (file.size > MAX_BYTES) {
          setError("Photo too large (max 20 MB).");
          continue;
        }
        const fd = new FormData();
        fd.append("token", token);
        fd.append("file", file);
        const res = await fetch(`/api/phone/channel/${channelId}/upload`, {
          method: "POST",
          body: fd,
        });
        if (res.status === 404) {
          setExpired(true);
          return;
        }
        const body = (await res.json().catch(() => ({}))) as {
          count?: number;
          error?: string;
        };
        if (!res.ok) {
          setError(body.error ?? `Error ${res.status}`);
          if (res.status === 409) return; // limite atteinte : inutile de continuer
          continue;
        }
        if (typeof body.count === "number") setCount(body.count);
      }
    } catch {
      setError("Could not reach your computer. Same Wi-Fi?");
    } finally {
      setSending(false);
    }
  }

  if (expired) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="eyebrow">OCTOPUS</p>
        <h1 className="text-xl font-semibold tracking-tight">This code has expired</h1>
        <p className="text-sm text-muted max-w-xs">
          Open the QR panel again on your computer and scan the new code.
        </p>
      </main>
    );
  }

  const full = count >= MAX_PHOTOS;

  return (
    <main className="min-h-screen max-w-md mx-auto flex flex-col gap-4 px-6 py-10">
      <header className="text-center mb-2">
        <p className="eyebrow">OCTOPUS</p>
        <h1 className="text-2xl font-semibold tracking-tight mt-1">Send photos</h1>
        <p className="text-sm text-muted mt-2">
          Photos land on your computer as you take them.
        </p>
      </header>

      <input
        ref={cameraRef}
        type="file"
        accept={ACCEPT}
        capture="environment"
        className="hidden"
        onChange={(e) => {
          void send(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={libraryRef}
        type="file"
        accept={ACCEPT}
        multiple
        className="hidden"
        onChange={(e) => {
          void send(e.target.files);
          e.target.value = "";
        }}
      />

      <button
        type="button"
        disabled={sending || full}
        onClick={() => cameraRef.current?.click()}
        className="btn-primary w-full py-4 text-base disabled:opacity-50"
      >
        📷 Take a photo
      </button>
      <button
        type="button"
        disabled={sending || full}
        onClick={() => libraryRef.current?.click()}
        className="chip w-full justify-center py-4 text-base disabled:opacity-50"
      >
        🖼 Photo library
      </button>

      <p className="text-center text-sm text-muted mt-2">
        {sending ? "Sending…" : `${count}/${MAX_PHOTOS} sent`}
      </p>
      {full && (
        <p className="text-center text-[13px] text-muted">
          Limit reached ({MAX_PHOTOS} photos). Scan a new code for more.
        </p>
      )}
      {error && <p className="text-center text-[13px] text-danger">{error}</p>}
    </main>
  );
}
