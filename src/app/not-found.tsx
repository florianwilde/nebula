import Link from "next/link";
import { Compass } from "lucide-react";

export default function NotFound() {
  return (
    <div className="glass fade-up mx-auto mt-16 max-w-lg px-6 py-16 text-center">
      <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-violet-500/25 to-cyan-400/20 text-violet-200">
        <Compass className="h-6 w-6" />
      </span>
      <h1 className="mt-4 text-2xl font-semibold text-white">Nichts gefunden</h1>
      <p className="mt-2 text-sm text-slate-400">
        Diese Seite existiert nicht (mehr). Vielleicht wurde das Projekt geloescht.
      </p>
      <Link href="/" className="btn btn-primary mt-6">
        Zurueck zum Dashboard
      </Link>
    </div>
  );
}
