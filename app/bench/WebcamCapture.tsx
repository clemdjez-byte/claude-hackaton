"use client";

// Webcam de l'ordinateur en DIRECT + bouton de capture. Le flux s'ouvre au
// montage (onglet Photo actif) et se coupe au démontage → le voyant caméra
// s'éteint dès qu'on quitte l'onglet. La capture fige une image (JPEG) et la
// remonte au parent via onCapture (upload = route evidence-photo existante).
// `autoCapture` : quand il passe à true (photo à la voix), une capture part dès
// que la caméra est prête, puis le parent est prévenu (onAutoCaptured) pour
// remettre le drapeau à false — idempotent, pas de capture parasite au montage.
import { useEffect, useRef, useState } from "react";

type Status = "starting" | "live" | "denied" | "unsupported" | "error";

export function WebcamCapture({
  onCapture,
  busy = false,
  autoCapture = false,
  onAutoCaptured,
}: {
  onCapture: (file: File) => void;
  busy?: boolean;
  autoCapture?: boolean;
  onAutoCaptured?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const onCaptureRef = useRef(onCapture);
  const onAutoCapturedRef = useRef(onAutoCaptured);
  const [status, setStatus] = useState<Status>("starting");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    onCaptureRef.current = onCapture;
    onAutoCapturedRef.current = onAutoCaptured;
  });

  // Ouvre la caméra frontale au montage, la ferme au démontage.
  useEffect(() => {
    let cancelled = false;
    const media = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
    if (!media?.getUserMedia) {
      // Capacité navigateur : indétectable au SSR, donc seulement ici (cf. useVoice).
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStatus("unsupported");
      return;
    }
    media
      .getUserMedia({ video: { facingMode: "user" }, audio: false })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) {
          setStatus("live");
          return;
        }
        video.srcObject = stream;
        // "live" SEULEMENT quand une image est décodée (videoWidth > 0), sinon une
        // capture immédiate (photo à la voix, onglet pas encore ouvert) dessinerait
        // une frame vide et s'annulerait en silence.
        const markLive = () => {
          if (!cancelled) setStatus("live");
        };
        if (video.readyState >= 2 && video.videoWidth > 0) markLive();
        else video.addEventListener("loadeddata", markLive, { once: true });
        void video.play().catch(() => {});
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        const name = e instanceof DOMException ? e.name : "";
        setStatus(name === "NotAllowedError" || name === "SecurityError" ? "denied" : "error");
        setError(e instanceof Error ? e.message : "Camera error");
      });
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  function snap() {
    const video = videoRef.current;
    if (!video || status !== "live") return;
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) return;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const cx = canvas.getContext("2d");
    if (!cx) return;
    cx.drawImage(video, 0, 0, w, h);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], `webcam-${Date.now()}.jpg`, { type: "image/jpeg" });
        onCaptureRef.current(file);
      },
      "image/jpeg",
      0.92
    );
  }

  // Capture à la voix : dès que la demande est là ET la caméra prête, on shoote
  // puis on prévient le parent (qui remet autoCapture à false).
  useEffect(() => {
    if (!autoCapture || status !== "live") return;
    snap();
    onAutoCapturedRef.current?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoCapture, status]);

  if (status === "unsupported" || status === "denied" || status === "error") {
    return (
      <div className="rounded-[10px] border border-[var(--oct-border,#E5E2D8)] bg-[var(--oct-paper-2,#F0EDE3)] px-3 py-3 text-[13px] text-muted space-y-1">
        <p className="font-medium text-foreground">
          {status === "denied" ? "Camera access blocked" : "Camera unavailable"}
        </p>
        <p>
          {status === "denied"
            ? "Allow camera access in your browser to capture photos."
            : status === "unsupported"
              ? "This browser has no webcam access."
              : (error ?? "Could not open the camera.")}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="relative rounded-[10px] overflow-hidden border border-[var(--oct-border,#E5E2D8)] bg-black aspect-[4/3]">
        <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />
        {status === "starting" && (
          <div className="absolute inset-0 flex items-center justify-center text-[13px] text-white/80">
            <span className="status-dot active mr-2" aria-hidden /> Opening camera…
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={snap}
        disabled={status !== "live" || busy}
        className="btn-primary w-full disabled:opacity-50"
      >
        {busy ? "Saving…" : "Capture photo"}
      </button>
    </div>
  );
}
