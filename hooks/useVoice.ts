"use client";
// hooks/useVoice.ts — voix 100 % navigateur (Web Speech API). SSR-safe : rien
// ne touche window hors des effets/handlers. Instance unique en ref, cleanup
// pour le double-montage StrictMode. STT et TTS mutuellement exclusifs (anti-écho).
import { useCallback, useEffect, useRef, useState } from "react";

type SpeechRecognitionCtor = new () => SpeechRecognition;

export interface UseVoice {
  isSupported: boolean;
  isListening: boolean;
  isSpeaking: boolean;
  interim: string;
  error: string | null;
  startListening: () => void;
  stopListening: () => void;
  speak: (text: string) => void;
}

export function useVoice(opts?: {
  lang?: string;
  onTranscript?: (finalText: string) => void;
}): UseVoice {
  const lang = opts?.lang ?? "fr-FR";
  const onTranscript = opts?.onTranscript;

  const recRef = useRef<SpeechRecognition | null>(null);
  const shouldListenRef = useRef(false);
  const [isSupported, setIsSupported] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);

  // garde la dernière callback sans réinstancier la reco
  const onTranscriptRef = useRef(onTranscript);
  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);

  useEffect(() => {
    const Ctor: SpeechRecognitionCtor | undefined =
      (window as unknown as { SpeechRecognition?: SpeechRecognitionCtor }).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: SpeechRecognitionCtor }).webkitSpeechRecognition;
    if (!Ctor) {
      setIsSupported(false);
      return;
    }
    setIsSupported(true);
    const rec = new Ctor();
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = true;

    rec.onresult = (e: SpeechRecognitionEvent) => {
      let itm = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) {
          const t = r[0].transcript.trim();
          if (t) onTranscriptRef.current?.(t);
        } else itm += r[0].transcript;
      }
      setInterim(itm);
    };
    rec.onerror = (e: SpeechRecognitionErrorEvent) => {
      setError(e.error);
      if (e.error === "network" || e.error === "not-allowed" || e.error === "service-not-allowed") {
        shouldListenRef.current = false;
        setIsListening(false);
      }
    };
    rec.onend = () => {
      if (shouldListenRef.current) {
        try {
          rec.start();
        } catch {
          /* déjà démarré */
        }
      } else {
        setIsListening(false);
        setInterim("");
      }
    };

    recRef.current = rec;
    return () => {
      shouldListenRef.current = false;
      try {
        rec.stop();
      } catch {
        /* noop */
      }
      recRef.current = null;
    };
  }, [lang]);

  const startListening = useCallback(() => {
    if (!recRef.current || shouldListenRef.current) return;
    setError(null);
    shouldListenRef.current = true;
    try {
      window.speechSynthesis?.cancel(); // coupe le TTS pour éviter l'écho
    } catch {
      /* noop */
    }
    try {
      recRef.current.start();
      setIsListening(true);
    } catch {
      /* noop */
    }
  }, []);

  const stopListening = useCallback(() => {
    shouldListenRef.current = false;
    try {
      recRef.current?.stop();
    } catch {
      /* noop */
    }
    setIsListening(false);
  }, []);

  const speak = useCallback(
    (text: string) => {
      if (typeof window === "undefined" || !window.speechSynthesis || !text) return;
      const wasListening = shouldListenRef.current;
      // exclusivité STT/TTS
      shouldListenRef.current = false;
      try {
        recRef.current?.stop();
      } catch {
        /* noop */
      }
      const u = new SpeechSynthesisUtterance(text);
      u.lang = lang;
      const voices = window.speechSynthesis.getVoices();
      const pick =
        voices.find((v) => v.lang.startsWith("fr") && /google/i.test(v.name)) ||
        voices.find((v) => v.lang.startsWith("fr") && /natural|neural|siri|premium/i.test(v.name)) ||
        voices.find((v) => v.lang.startsWith("fr")) ||
        voices[0];
      if (pick) u.voice = pick;
      u.onstart = () => setIsSpeaking(true);
      u.onend = () => {
        setIsSpeaking(false);
        if (wasListening) {
          shouldListenRef.current = true;
          try {
            recRef.current?.start();
            setIsListening(true);
          } catch {
            /* noop */
          }
        }
      };
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    },
    [lang]
  );

  return { isSupported, isListening, isSpeaking, interim, error, startListening, stopListening, speak };
}
