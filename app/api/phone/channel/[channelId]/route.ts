// Polling + fermeture d'un canal téléphone. Le token du QR est exigé (`?t=`) :
// sans lui, impossible de lister les photos ou de fermer le canal.
import { closeChannel, getChannel } from "@/lib/phone-channel";

export const runtime = "nodejs";

type Params = Promise<{ channelId: string }>;

function tokenOf(req: Request): string {
  return new URL(req.url).searchParams.get("t") ?? "";
}

export async function GET(req: Request, { params }: { params: Params }) {
  const { channelId } = await params;
  const channel = getChannel(channelId);
  if (!channel) return Response.json({ error: "Channel expired." }, { status: 404 });
  if (tokenOf(req) !== channel.token) {
    return Response.json({ error: "Invalid token." }, { status: 401 });
  }
  return Response.json({ files: channel.files, expiresAt: channel.expiresAt });
}

export async function DELETE(req: Request, { params }: { params: Params }) {
  const { channelId } = await params;
  const channel = getChannel(channelId);
  // Idempotent : un canal déjà fermé ou expiré est un succès.
  if (channel && tokenOf(req) === channel.token) closeChannel(channelId);
  return Response.json({ ok: true });
}
