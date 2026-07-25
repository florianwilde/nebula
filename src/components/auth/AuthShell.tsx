import { Sparkles } from "lucide-react";

/** Zentrierte Karte fuer Einrichtung, Anmeldung und Registrierung. */
export function AuthShell({
  appName,
  title,
  subtitle,
  children,
  footer,
}: {
  appName: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-md flex-col justify-center py-10">
      <div className="glass fade-up relative overflow-hidden p-7">
        <span className="accent-bar absolute inset-x-0 top-0 h-[3px]" aria-hidden="true" />
        <div
          className="pointer-events-none absolute -right-24 -top-24 h-56 w-56 rounded-full opacity-25 blur-3xl"
          style={{ background: "radial-gradient(circle, #8b5cf6, transparent 70%)" }}
          aria-hidden="true"
        />

        <div className="mb-6 flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-violet-500 via-fuchsia-500 to-cyan-400">
            <Sparkles className="h-5 w-5 text-white" strokeWidth={2.4} />
          </span>
          <div>
            <p className="text-gradient text-lg font-semibold leading-none">{appName}</p>
            <p className="mt-1 text-[10px] uppercase tracking-[0.2em] text-slate-500">
              Vibe Coding Dashboard
            </p>
          </div>
        </div>

        <h1 className="text-xl font-semibold text-white">{title}</h1>
        {subtitle ? <p className="mt-1.5 text-sm text-slate-400">{subtitle}</p> : null}

        <div className="mt-6">{children}</div>
      </div>

      {footer ? <div className="mt-4 text-center text-sm text-slate-500">{footer}</div> : null}
    </div>
  );
}
