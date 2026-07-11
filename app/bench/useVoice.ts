"use client";
// useVoice — voix 100 % navigateur (Web Speech API), portée d'Octopus.
// SSR-safe : rien ne touche window hors des effets/handlers. Instance unique en
// ref, cleanup pour le double-montage StrictMode. STT et TTS mutuellement
// exclusifs (anti-écho). Chrome/Edge (et Safari) uniquement.
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
  speakChunk: (text: string) => void;
  speakDone: () => void;
}

export function useVoice(opts?: {
  lang?: string;
  onTranscript?: (finalText: string) => void;
}): UseVoice {
  const lang = opts?.lang ?? "fr-FR";
  const onTranscript = opts?.onTranscript;

  const pickVoice = useCallback((): SpeechSynthesisVoice | undefined => {
    const prefix = lang.slice(0, 2); // "fr-FR" → "fr", "en-US" → "en"
    const voices = window.speechSynthesis.getVoices();
    return (
      voices.find((v) => v.lang.startsWith(prefix) && /google/i.test(v.name)) ||
      voices.find((v) => v.lang.startsWith(prefix) && /natural|neural|siri|premium/i.test(v.name)) ||
      voices.find((v) => v.lang.startsWith(prefix)) ||
      voices[0]
    );
  }, [lang]);

  const recRef = useRef<SpeechRecognition | null>(null);
  const shouldListenRef = useRef(false);
  // File TTS pour la lecture par phrases pendant le streaming.
  //  - pending   : nombre d'utterances encore en file/en cours.
  //  - turnActive: un tour de parole est en cours (du 1er chunk jusqu'à la reprise).
  //  - turnEnded : le flux a fini d'envoyer du texte (speakDone appelé).
  //  - wasListening: le micro écoutait avant qu'on le coupe (à rouvrir en fin de tour).
  // On rouvre le micro uniquement quand le tour est fini ET la file vidée, pour ne
  // pas s'écouter parler et ne pas rouvrir entre deux phrases lentes.
  const pendingRef = useRef(0);
  const turnActiveRef = useRef(false);
  const turnEndedRef = useRef(false);
  const wasListeningRef = useRef(false);
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
    // Détection de capacité navigateur : window est indisponible au SSR, donc
    // ce check ne peut vivre que dans un effet (un seul setState, au montage).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsSupported(!!Ctor);
    if (!Ctor) return;
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
      const pick = pickVoice();
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
    [lang, pickVoice]
  );

  // Fin d'un tour de parole : le micro se rouvre s'il écoutait avant, et le tour
  // est marqué inactif. Appelé quand la file est vidée ET le flux terminé.
  const endTurn = useCallback(() => {
    turnActiveRef.current = false;
    if (wasListeningRef.current) {
      shouldListenRef.current = true;
      try {
        recRef.current?.start();
        setIsListening(true);
      } catch {
        /* noop */
      }
    }
  }, []);

  const speakChunk = useCallback(
    (text: string) => {
      if (typeof window === "undefined" || !window.speechSynthesis || !text.trim()) return;
      // Premier chunk du tour : couper le micro (anti-écho) et repartir propre.
      if (!turnActiveRef.current) {
        turnActiveRef.current = true;
        turnEndedRef.current = false;
        wasListeningRef.current = shouldListenRef.current;
        shouldListenRef.current = false;
        try {
          recRef.current?.stop();
        } catch {
          /* noop */
        }
        try {
          window.speechSynthesis.cancel(); // vide un reliquat du tour précédent
        } catch {
          /* noop */
        }
      }
      const u = new SpeechSynthesisUtterance(text);
      u.lang = lang;
      const pick = pickVoice();
      if (pick) u.voice = pick;
      pendingRef.current += 1;
      setIsSpeaking(true);
      // Sur Chrome, une utterance ANNULÉE (speechSynthesis.cancel(), déclenché
      // par startListening() ou speak()) émet "error", pas "end" : les deux cas
      // doivent décrémenter la file de la même façon, sinon pendingRef ne
      // redescend jamais à 0 et le micro ne se rouvre plus (voix figée).
      const onUtteranceSettled = () => {
        pendingRef.current = Math.max(0, pendingRef.current - 1);
        if (pendingRef.current === 0) {
          setIsSpeaking(false);
          // File vidée : si le flux est fini, on clôt le tour (rouvre le micro).
          if (turnEndedRef.current) endTurn();
        }
      };
      u.onend = onUtteranceSettled;
      u.onerror = onUtteranceSettled;
      window.speechSynthesis.speak(u); // PAS de cancel : on enfile les phrases
    },
    [lang, endTurn, pickVoice]
  );

  const speakDone = useCallback(() => {
    // Fin d'envoi du tour : si la file est déjà vide, on clôt tout de suite ;
    // sinon le dernier onend s'en chargera (voir speakChunk).
    turnEndedRef.current = true;
    if (pendingRef.current === 0) endTurn();
  }, [endTurn]);

  return { isSupported, isListening, isSpeaking, interim, error, startListening, stopListening, speak, speakChunk, speakDone };
}
