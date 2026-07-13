"use client";

// Bouton « From phone » réutilisable : crée un canal éphémère, affiche le QR à
// scanner, et poll le canal tant que le panneau est ouvert. Chaque photo reçue
// est reconstruite en File et remise au parent via onFiles — le circuit d'import
// existant (protocole, photo de run, data) reste inchangé, comme si le fichier
// venait de l'ordinateur.
import { useEffect, useRef, useState } from "react";

type Channel = {
  channelId: string;
  token: string;
  url: string;
  qrDataUrl: string;
  expiresAt: number;
};

type PhoneFile = { fileId: string; name: string; mime: string };

export function PhoneImport({
  onFiles,
  disabled,
}: {
  onFiles: (files: File[]) => void | Promise<void>;
  disabled?: boolean;
}) {
  const [channel, setChannel] = useState<Channel | null>(null);
  const [received, setReceived] = useState(0);
  const [expired, setExpired] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Ref tenue à jour à chaque render (via effect) : le onFiles du parent capture
  // un state qui bouge pendant que le panneau est ouvert (ex. le stepId courant
  // de RunConsole).
  const onFilesRef = useRef(onFiles);
  useEffect(() => {
    onFilesRef.current = onFiles;
  });
  const seenRef = useRef<Set<string>>(new Set());
  const busyRef = useRef(false);

  async function openChannel() {
    setError(null);
    setExpired(false);
    setReceived(0);
    seenRef.current = new Set();
    try {
      const res = await fetch("/api/phone/channel", { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as Channel & { error?: string };
      if (!res.ok) throw new Error(body.error ?? `Error ${res.status}`);
      setChannel(body);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the QR code.");
    }
  }

  useEffect(() => {
    if (!channel) return;
    const { channelId, token } = channel;
    const interval = setInterval(async () => {
      if (busyRef.current) return;
      busyRef.current = true;
      try {
        const res = await fetch(`/api/phone/channel/${channelId}?t=${token}`);
        if (res.status === 404) {
          setExpired(true);
          clearInterval(interval);
          return;
        }
        if (!res.ok) return;
        const body = (await res.json()) as { files: PhoneFile[] };
        const fresh = body.files.filter((f) => !seenRef.current.has(f.fileId));
        if (fresh.length === 0) return;
        // Marqués « vus » AVANT le fetch des binaires : jamais consommés deux fois.
        fresh.forEach((f) => seenRef.current.add(f.fileId));
        const files: File[] = [];
        for (const f of fresh) {
          const bin = await fetch(`/api/files/${f.fileId}`);
          if (!bin.ok) continue;
          const blob = await bin.blob();
          files.push(new File([blob], f.name, { type: f.mime }));
        }
        if (files.length > 0) {
          setReceived((n) => n + files.length);
          await onFilesRef.current(files);
        }
      } catch {
        // Tick raté (réseau) : on retentera au suivant.
      } finally {
        busyRef.current = false;
      }
    }, 2000);
    return () => {
      clearInterval(interval);
      // Fermeture du canal en quittant (Done, changement d'onglet, démontage).
      void fetch(`/api/phone/channel/${channelId}?t=${token}`, { method: "DELETE" }).catch(
        () => {}
      );
    };
  }, [channel]);

  if (!channel) {
    return (
      <div className="space-y-2">
        <button
          type="button"
          disabled={disabled}
          onClick={() => void openChannel()}
          className="chip w-full justify-center disabled:opacity-50"
        >
          📱 From phone
        </button>
        {error && <p className="text-[13px] text-danger">{error}</p>}
      </div>
    );
  }

  return (
    <div className="border border-dashed rounded-xl p-3 space-y-2 text-center">
      {expired ? (
        <>
          <p className="text-[13px] text-muted">This code has expired.</p>
          <button
            type="button"
            onClick={() => void openChannel()}
            className="chip w-full justify-center"
          >
            New code
          </button>
        </>
      ) : (
        <>
          {/* Data URL générée côté serveur : next/image n'apporte rien ici. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={channel.qrDataUrl}
            alt="QR code — scan with your phone"
            width={160}
            height={160}
            className="mx-auto rounded-md"
          />
          <p className="text-[13px] text-muted">Scan with your phone (same Wi-Fi)</p>
          <p className="receipt break-all select-all">{channel.url}</p>
          <p className="text-[13px]">
            {received > 0
              ? `${received} photo${received > 1 ? "s" : ""} received`
              : "Waiting for photos…"}
          </p>
        </>
      )}
      <button
        type="button"
        onClick={() => {
          setChannel(null); // le cleanup de l'effect envoie le DELETE
          setExpired(false);
        }}
        className="chip w-full justify-center"
      >
        Done
      </button>
    </div>
  );
}
