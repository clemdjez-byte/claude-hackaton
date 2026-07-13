// Page mobile ouverte en scannant le QR « From phone » du desktop : hors shell
// Octopus (le layout racine est nu), juste l'envoi de photos vers le canal.
import PhoneUploadClient from "./PhoneUploadClient";

export const metadata = { title: "Octopus — Send photos" };

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ channelId: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { channelId } = await params;
  const { t } = await searchParams;
  return <PhoneUploadClient channelId={channelId} token={t ?? ""} />;
}
