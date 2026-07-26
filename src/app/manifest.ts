import type { MetadataRoute } from "next";
import { APP_NAME, APP_TAGLINE } from "@/lib/config";

/**
 * Web-App-Manifest: macht Nebula auf dem Handy installierbar.
 *
 * Als Funktion und nicht als Konstante, aus demselben Grund wie bei
 * generateMetadata: nur so wird APP_NAME zur Laufzeit gelesen. Ein
 * konstanter Export waere beim Build eingefroren und liesse sich im
 * fertigen Docker-Image nicht mehr aendern.
 */
export const dynamic = "force-dynamic";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${APP_NAME} – ${APP_TAGLINE} Dashboard`,
    short_name: APP_NAME,
    description:
      "Uebersicht ueber alle Vibe-Coding-Projekte: Status, Notizen und Live-Daten aus GitHub, GitLab und Gitea.",
    // Ohne Adressleiste, aber mit den Systemleisten – die Anwendung braucht
    // keinen Vollbildmodus, wohl aber die Uhrzeit und den Akkustand.
    display: "standalone",
    start_url: "/",
    scope: "/",
    background_color: "#05060f",
    theme_color: "#05060f",
    lang: "de",
    orientation: "any",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // Getrennte Fassung mit mehr Rand: Android schneidet maskierbare
      // Symbole je nach Geraet rund, eckig oder als Tropfen zu.
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Dashboard", url: "/" },
      { name: "Mein Konto", url: "/account" },
    ],
  };
}
