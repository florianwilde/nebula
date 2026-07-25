"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const isDbError =
    /database|prisma|ECONNREFUSED|P1001|does not exist/i.test(error.message ?? "");

  return (
    <div className="glass fade-up mx-auto mt-16 max-w-2xl px-6 py-14">
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-rose-500/15 text-rose-300">
        <AlertTriangle className="h-6 w-6" />
      </span>
      <h1 className="mt-4 text-xl font-semibold text-white">Da ist etwas schiefgelaufen</h1>
      <p className="mt-2 text-sm text-slate-400">{error.message}</p>

      {isDbError ? (
        <div className="mt-5 rounded-xl border border-white/8 bg-black/30 p-4 text-sm text-slate-400">
          <p className="font-medium text-slate-200">Sieht nach einem Datenbankproblem aus.</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs">
            <li>
              Laeuft PostgreSQL? <code className="text-violet-300">docker compose up -d db</code>
            </li>
            <li>
              Stimmt <code className="text-violet-300">DATABASE_URL</code> in der{" "}
              <code className="text-violet-300">.env</code>?
            </li>
            <li>
              Migrationen eingespielt? <code className="text-violet-300">npm run db:migrate</code>
            </li>
          </ol>
        </div>
      ) : null}

      <button type="button" className="btn btn-primary mt-6" onClick={reset}>
        <RotateCcw className="h-4 w-4" />
        Erneut versuchen
      </button>
    </div>
  );
}
