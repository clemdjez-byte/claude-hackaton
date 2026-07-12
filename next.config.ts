import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // better-sqlite3 est un module natif : il doit rester externe au bundle serveur.
  serverExternalPackages: ["better-sqlite3"],
  // Masque la pastille d'indicateur de dev Next (rond "N" en bas à gauche) qui
  // recouvrait le libellé "Knowledge graph · N documents" de l'accueil.
  devIndicators: false,
};

export default nextConfig;
