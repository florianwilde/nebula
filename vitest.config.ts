import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    // Reine Logik, kein DOM und keine Datenbank – die Tests laufen in
    // Millisekunden und brauchen weder Server noch Container.
    //
    // .tsx ist dabei, weil die Bereinigung des Markdowns nur am erzeugten
    // HTML zu pruefen ist. Dafuer genuegt renderToStaticMarkup; ein DOM
    // braucht es dazu nicht.
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
  // Die tsconfig setzt jsx auf "preserve", weil Next das selbst uebersetzt.
  // Hier gibt es kein Next, also muss der Transformer es tun. Vite nimmt
  // inzwischen oxc statt esbuild – die esbuild-Option wuerde ignoriert.
  oxc: { jsx: { runtime: "automatic" } },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
