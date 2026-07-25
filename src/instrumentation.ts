/**
 * Wird von Next einmal beim Start des Servers ausgefuehrt.
 *
 * Hier haengt der Zeitgeber fuer den automatischen Abgleich.
 *
 * Wichtig ist die Form der Abfrage: Next uebersetzt diese Datei auch fuer den
 * Edge-Runtime (weil es eine Middleware gibt). Dort gibt es weder node:crypto
 * noch node:net, die der Abgleich mitbringt. Der Import muss deshalb *in* der
 * positiven Bedingung stehen – dann ersetzt der Bundler NEXT_RUNTIME beim
 * Bauen und entfernt den ganzen Block aus dem Edge-Bundle. Mit einem frueh
 * abbrechenden "if (… !== 'nodejs') return" bliebe der Import stehen und der
 * Build schluege fehl.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { describeConfig } = await import("@/lib/config");
    console.log(`[nebula] Konfiguration: ${describeConfig()}`);

    const { startAutoSyncScheduler } = await import("@/lib/sync/scheduler");
    startAutoSyncScheduler();
  }
}
