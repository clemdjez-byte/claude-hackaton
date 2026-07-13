// Crée un « canal téléphone » : le desktop affiche le QR renvoyé, le téléphone
// le scanne et dépose ses photos sur ce canal. L'URL pointe vers l'IP LAN du
// Mac — l'app tourne en local mais Next écoute sur toutes les interfaces, donc
// un téléphone sur le même Wi-Fi la joint directement.
import os from "node:os";
import QRCode from "qrcode";
import { createChannel } from "@/lib/phone-channel";

export const runtime = "nodejs";

// IPv4 non-interne, hors link-local (169.254.*) ; on préfère en* (Wi-Fi/Ethernet
// sur Mac, en0 d'abord). Fallback : hostname `.local` résolu en Bonjour.
function lanIp(): string | null {
  const candidates: { name: string; address: string }[] = [];
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    for (const addr of addrs ?? []) {
      if (addr.family !== "IPv4" || addr.internal) continue;
      if (addr.address.startsWith("169.254.")) continue;
      candidates.push({ name, address: addr.address });
    }
  }
  candidates.sort((a, b) => {
    const aEn = a.name.startsWith("en") ? 0 : 1;
    const bEn = b.name.startsWith("en") ? 0 : 1;
    return aEn - bEn || a.name.localeCompare(b.name);
  });
  return candidates[0]?.address ?? null;
}

export async function POST(req: Request) {
  const channel = createChannel();
  const host = req.headers.get("host") ?? "";
  const port = host.includes(":") ? host.slice(host.lastIndexOf(":") + 1) : "3000";
  const ip = lanIp() ?? os.hostname();
  const url = `http://${ip}:${port}/m/${channel.id}?t=${channel.token}`;
  const qrDataUrl = await QRCode.toDataURL(url, { margin: 1, width: 240 });
  return Response.json({
    channelId: channel.id,
    token: channel.token,
    url,
    qrDataUrl,
    expiresAt: channel.expiresAt,
  });
}
