"use client";
// useVoiceRoom — remplace useVoice (Web Speech) : le navigateur rejoint la room
// LiveKit du run, publie le micro (echo cancellation native → barge-in possible,
// le micro reste OUVERT pendant que l'agent parle), joue l'audio de l'agent,
// affiche les transcriptions des deux côtés et exécute les ordres de l'agent
// (photo, caméra, timer, refresh) reçus par RPC.
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ParticipantKind,
  Room,
  RoomEvent,
  Track,
  type RemoteTrack,
  type RpcInvocationData,
} from "livekit-client";

// Miroir du ClientEvent de voice-agent/tools.ts (pas d'import croisé : le hook
// est du code client, voice-agent/ tire better-sqlite3).
export type ClientEvent =
  | { type: "capture_photo" }
  | { type: "close_camera" }
  | { type: "timer"; label: string; seconds: number }
  | { type: "timer_control"; action: "pause" | "resume" | "stop" | "clear"; label?: string }
  | { type: "did_act" };

export type VoiceRoomStatus =
  | "off" | "connecting" | "waiting_agent"
  | "initializing" | "idle" | "listening" | "thinking" | "speaking"
  | "error";

export type TranscriptLine = { id: string; from: "you" | "agent"; text: string; final: boolean };

const AGENT_TIMEOUT_MS = 8000;
const HINT = "Lance `npm run voice` dans un terminal (voir README).";

export function useVoiceRoom(opts: { runId: string; onEvent: (ev: ClientEvent) => void }) {
  const [status, setStatus] = useState<VoiceRoomStatus>("off");
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const roomRef = useRef<Room | null>(null);
  // Verrou synchrone posé AVANT le premier await de connect() : ferme la
  // fenêtre de double-clic pendant le fetch du token (roomRef encore null).
  const connectingRef = useRef(false);
  const onEventRef = useRef(opts.onEvent);
  useEffect(() => {
    onEventRef.current = opts.onEvent;
  });

  const disconnect = useCallback(() => {
    void roomRef.current?.disconnect();
    roomRef.current = null;
    setStatus("off");
    setMuted(false);
  }, []);

  const connect = useCallback(async () => {
    // Garde de réentrance : connexion déjà en cours ou room déjà active → no-op
    // (couvre le double-clic sur Start et l'appel alors qu'on est connecté).
    if (connectingRef.current || roomRef.current) return;
    connectingRef.current = true;
    setError(null);
    setTranscript([]);
    setStatus("connecting");

    let grant: { url: string; token: string };
    try {
      const res = await fetch("/api/bench/voice-token", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ runId: opts.runId }),
      });
      if (!res.ok) throw new Error(String(res.status));
      grant = await res.json();
    } catch {
      connectingRef.current = false;
      setError("Impossible d'obtenir l'accès voix (serveur Next).");
      setStatus("error");
      return;
    }

    const room = new Room({
      audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true },
    });
    roomRef.current = room;

    // Audio de l'agent : éléments <audio> cachés attachés au body.
    room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
      if (track.kind === Track.Kind.Audio) {
        const el = track.attach();
        el.style.display = "none";
        document.body.appendChild(el);
      }
    });
    room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
      for (const el of track.detach()) el.remove();
    });
    room.on(RoomEvent.Disconnected, () => {
      if (roomRef.current === room) {
        roomRef.current = null;
        setStatus("off");
      }
    });

    // État de l'agent (listening/thinking/speaking) publié en attribut LiveKit.
    room.on(RoomEvent.ParticipantAttributesChanged, (_changed, participant) => {
      if (participant.kind !== ParticipantKind.AGENT) return;
      const s = participant.attributes["lk.agent.state"];
      if (s === "initializing" || s === "idle" || s === "listening" || s === "thinking" || s === "speaking") {
        setStatus(s);
      }
    });

    // Transcriptions temps réel (topic standard lk.transcription, streamé par
    // segments ; un segment est mis à jour jusqu'à lk.transcription_final).
    room.registerTextStreamHandler("lk.transcription", async (reader, participantInfo) => {
      const from: TranscriptLine["from"] =
        participantInfo.identity === room.localParticipant.identity ? "you" : "agent";
      // Une mise à jour STT interim ré-émet un NOUVEAU stream (nouvel
      // info.id) mais garde le même lk.segment_id : clé par segment_id pour
      // remplacer la ligne précédente au lieu de l'empiler. Côté agent, un
      // segment = un seul stream (deltas via text += chunk, inchangé).
      const id = reader.info.attributes?.["lk.segment_id"] ?? reader.info.id;
      let text = "";
      for await (const chunk of reader) {
        text += chunk;
        const final = reader.info.attributes?.["lk.transcription_final"] === "true";
        setTranscript((lines) => {
          const next = lines.filter((l) => l.id !== id);
          next.push({ id, from, text, final });
          return next.slice(-20); // fenêtre courte : c'est un fil de conversation
        });
      }
    });

    // Ordres de l'agent (photo, caméra, timer, refresh).
    room.registerRpcMethod("bench.client_event", async (data: RpcInvocationData) => {
      try {
        onEventRef.current(JSON.parse(data.payload) as ClientEvent);
      } catch {
        /* payload inattendu : ignoré */
      }
      return "ok";
    });

    try {
      await room.connect(grant.url, grant.token);
      await room.localParticipant.setMicrophoneEnabled(true);
      await room.startAudio(); // appelé depuis le clic Start → autoplay OK
    } catch (e) {
      console.warn("[voice] connexion échouée:", e);
      connectingRef.current = false;
      // On raccroche toujours la room qui a échoué, mais on ne touche à
      // error/status/roomRef que si c'est encore la room courante (disconnect()
      // a pu être appelé pendant les await : ne pas clobber l'état).
      void room.disconnect();
      if (roomRef.current !== room) return;
      setError(`Connexion voix impossible. ${HINT}`);
      setStatus("error");
      roomRef.current = null;
      return;
    }

    connectingRef.current = false;

    // disconnect() a pu être appelé pendant les await ci-dessus : cette room
    // est alors orpheline — on la raccroche sans toucher à l'état courant.
    if (roomRef.current !== room) {
      void room.disconnect();
      return;
    }

    setStatus("waiting_agent");
    setTimeout(() => {
      if (roomRef.current !== room) return;
      const hasAgent = [...room.remoteParticipants.values()].some(
        (p) => p.kind === ParticipantKind.AGENT
      );
      if (!hasAgent) {
        setError(`L'agent vocal n'a pas rejoint. ${HINT}`);
        setStatus("error");
        void room.disconnect();
        roomRef.current = null;
      }
    }, AGENT_TIMEOUT_MS);
  }, [opts.runId]);

  const toggleMute = useCallback(() => {
    const room = roomRef.current;
    if (!room) return;
    const next = !muted;
    void room.localParticipant.setMicrophoneEnabled(!next);
    setMuted(next);
  }, [muted]);

  // Raccroche en quittant la page.
  useEffect(() => () => void roomRef.current?.disconnect(), []);

  return { status, error, transcript, muted, connect, disconnect, toggleMute };
}
