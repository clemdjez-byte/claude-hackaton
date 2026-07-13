// lib/phone-channel.ts — registre en mémoire des « canaux téléphone » : un canal
// éphémère par panneau QR ouvert sur le desktop. Le téléphone y dépose des photos
// (staging dans la table `fichier`), le desktop les récupère par polling puis les
// rejoue dans le circuit d'import existant. Map sur globalThis pour survivre au
// HMR de dev ; un restart serveur perd les canaux ouverts → on re-scanne.
import { randomBytes } from "node:crypto";

export type PhoneFile = { fileId: string; name: string; mime: string };
export type PhoneChannel = {
  id: string;
  token: string;
  expiresAt: number;
  files: PhoneFile[];
};

export const CHANNEL_TTL_MS = 15 * 60 * 1000;
export const MAX_PHOTOS_PER_CHANNEL = 10;

const g = globalThis as unknown as { __octoPhoneChannels?: Map<string, PhoneChannel> };

function channels(): Map<string, PhoneChannel> {
  if (!g.__octoPhoneChannels) g.__octoPhoneChannels = new Map();
  return g.__octoPhoneChannels;
}

export function createChannel(): PhoneChannel {
  const map = channels();
  // Sweep paresseux des canaux expirés — pas de setInterval côté serveur.
  const now = Date.now();
  for (const [id, ch] of map) {
    if (ch.expiresAt <= now) map.delete(id);
  }
  const channel: PhoneChannel = {
    id: randomBytes(4).toString("hex"),
    token: randomBytes(16).toString("hex"),
    expiresAt: now + CHANNEL_TTL_MS,
    files: [],
  };
  map.set(channel.id, channel);
  return channel;
}

/** null si le canal est inconnu OU expiré (purge au passage). */
export function getChannel(id: string): PhoneChannel | null {
  const ch = channels().get(id);
  if (!ch) return null;
  if (ch.expiresAt <= Date.now()) {
    channels().delete(id);
    return null;
  }
  return ch;
}

export function closeChannel(id: string): void {
  channels().delete(id);
}
