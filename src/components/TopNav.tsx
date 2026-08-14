"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  CheckSquare,
  GitBranch,
  LayoutDashboard,
  LogOut,
  Settings,
  ShieldCheck,
  Sparkles,
  UserRound,
  Zap,
} from "lucide-react";
import { QuickCapture } from "@/components/QuickCapture";
import { Popover } from "@/components/ui/Popover";
import type { SessionUser } from "@/lib/auth/session";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/tasks", label: "Aufgaben", icon: CheckSquare },
  { href: "/connections", label: "Git-Verbindungen", icon: GitBranch },
];

export function TopNav({
  user,
  appName,
  tagline,
}: {
  user: SessionUser | null;
  appName: string;
  tagline: string;
}) {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-white/5 bg-[#05060f]/70 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-[1400px] items-center gap-3 px-4 py-3 sm:gap-6 sm:px-6 lg:px-8">
        <Link href="/" className="group flex min-w-0 items-center gap-2 sm:gap-3">
          <span className="relative grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-violet-500 via-fuchsia-500 to-cyan-400 shadow-[0_8px_28px_-10px_rgba(168,85,247,0.9)] transition-transform group-hover:scale-105">
            <Sparkles className="h-4 w-4 text-white" strokeWidth={2.4} />
          </span>
          <span className="flex min-w-0 flex-col leading-none">
            <span className="text-gradient truncate text-lg font-semibold tracking-tight">
              {appName}
            </span>
            {/* Der weite Zeichenabstand kostet mehr Platz, als die Zeile wert
                ist. Seit die Aufgaben als dritter Punkt danebenstehen, brach
                sie auf 375px mitten im Wort ab – unterhalb von sm bleibt
                deshalb nur der Name. */}
            <span className="mt-0.5 hidden truncate text-[10px] uppercase tracking-[0.2em] text-slate-500 sm:block">
              {tagline}
            </span>
          </span>
        </Link>

        {user ? (
          <>
            <nav className="flex shrink-0 items-center gap-1">
              {LINKS.map(({ href, label, icon: Icon }) => {
                const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    // Unterhalb von sm bleibt nur das Symbol stehen. Ohne
                    // eigene Beschriftung ist der Verweis dann fuer einen
                    // Screenreader namenlos – axe-core meldet das als
                    // "link-name", und zwar zu Recht: vorgelesen wird nichts.
                    aria-label={label}
                    title={label}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
                      active
                        ? "bg-white/8 text-white"
                        : "text-slate-400 hover:bg-white/5 hover:text-slate-100",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="hidden sm:inline">{label}</span>
                  </Link>
                );
              })}
            </nav>

            <div className="ml-auto flex items-center gap-2">
              <QuickCaptureButton />
              <UserMenu user={user} />
            </div>
          </>
        ) : null}
      </div>
    </header>
  );
}

/**
 * Der Einstieg in die Schnellerfassung sitzt in der Kopfleiste, nicht als
 * schwebender Knopf unten rechts: dort waere er auf schmalen Anzeigen mit
 * der Auswahlleiste kollidiert, die beim Markieren von Projekten einfaehrt.
 * In der Kopfleiste ist er auf jeder Seite erreichbar.
 */
function QuickCaptureButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn btn-ghost px-2.5 py-1.5 sm:px-3"
        // Unterhalb von sm bleibt nur das Symbol – ohne Beschriftung waere
        // der Knopf fuer einen Screenreader namenlos.
        aria-label="Schnell erfassen"
        title="Schnell erfassen – Idee oder Aufgabe"
      >
        <Zap className="h-4 w-4" />
        <span className="hidden lg:inline">Erfassen</span>
      </button>

      <QuickCapture open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function UserMenu({ user }: { user: SessionUser }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  async function logout() {
    setBusy(true);
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    setOpen(false);
    router.replace("/login");
    router.refresh();
  }

  const label = user.displayName?.trim() || user.username;
  const initials = label.slice(0, 2).toUpperCase();

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/4 py-1.5 pl-1.5 pr-3 text-sm text-slate-200 transition-colors hover:bg-white/8"
        aria-haspopup="menu"
        aria-expanded={open}
        // Auf schmalen Anzeigen bleibt nur das Kuerzel sichtbar – ohne
        // Beschriftung liest ein Screenreader dann nur zwei Buchstaben vor.
        aria-label={`Benutzermenue fuer ${label}`}
      >
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-violet-500/80 to-cyan-400/70 text-[11px] font-semibold text-white">
          {initials}
        </span>
        <span className="hidden max-w-[10rem] truncate sm:inline">{label}</span>
        {user.role === "ADMIN" ? (
          <ShieldCheck className="hidden h-3.5 w-3.5 text-violet-300 sm:inline" />
        ) : null}
      </button>

      <Popover anchorRef={triggerRef} open={open} onClose={() => setOpen(false)} width={240}>
        <div className="border-b border-white/6 px-3 py-2">
          <p className="truncate text-sm text-slate-100">{label}</p>
          <p className="truncate text-[11px] text-slate-500">
            @{user.username}
            {user.role === "ADMIN" ? " · Administrator" : ""}
          </p>
        </div>

        <Link
          href="/account"
          role="menuitem"
          onClick={() => setOpen(false)}
          className="mt-1 flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-slate-300 transition-colors hover:bg-white/6 hover:text-white"
        >
          <UserRound className="h-4 w-4" />
          Mein Konto
        </Link>

        {user.role === "ADMIN" ? (
          <Link
            href="/admin"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-slate-300 transition-colors hover:bg-white/6 hover:text-white"
          >
            <Settings className="h-4 w-4" />
            Admin-Einstellungen
          </Link>
        ) : null}

        <button
          type="button"
          role="menuitem"
          onClick={logout}
          disabled={busy}
          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-rose-200 transition-colors hover:bg-rose-500/10 disabled:opacity-50"
        >
          <LogOut className="h-4 w-4" />
          Abmelden
        </button>
      </Popover>
    </>
  );
}
