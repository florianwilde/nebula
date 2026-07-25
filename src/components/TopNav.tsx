"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { GitBranch, LayoutDashboard, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/connections", label: "Git-Verbindungen", icon: GitBranch },
];

export function TopNav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-white/5 bg-[#05060f]/70 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-[1400px] items-center gap-6 px-4 py-3 sm:px-6 lg:px-8">
        <Link href="/" className="group flex items-center gap-3">
          <span className="relative grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-violet-500 via-fuchsia-500 to-cyan-400 shadow-[0_8px_28px_-10px_rgba(168,85,247,0.9)] transition-transform group-hover:scale-105">
            <Sparkles className="h-4 w-4 text-white" strokeWidth={2.4} />
          </span>
          <span className="flex flex-col leading-none">
            <span className="text-gradient text-lg font-semibold tracking-tight">
              Nebula
            </span>
            <span className="mt-0.5 text-[10px] uppercase tracking-[0.2em] text-slate-500">
              Vibe Coding
            </span>
          </span>
        </Link>

        <nav className="flex items-center gap-1">
          {LINKS.map(({ href, label, icon: Icon }) => {
            const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
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
      </div>
    </header>
  );
}
