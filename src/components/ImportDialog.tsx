"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  FileJson,
  Loader2,
  Upload,
} from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { cn } from "@/lib/utils";

type Strategy = "skip" | "rename" | "overwrite";

interface ItemResult {
  name: string;
  slug: string;
  action: "create" | "rename" | "overwrite" | "skip" | "error";
  newSlug?: string;
  notes: number;
  connection: "matched" | "missing" | "none";
  connectionName?: string;
  message?: string;
}

interface ImportResponse {
  dryRun: boolean;
  strategy: Strategy;
  summary: {
    total: number;
    created: number;
    renamed: number;
    overwritten: number;
    skipped: number;
    errors: number;
    missingConnections: number;
  };
  results: ItemResult[];
}

const STRATEGIES: Array<{ value: Strategy; label: string; hint: string }> = [
  { value: "skip", label: "Ueberspringen", hint: "Vorhandene bleiben unveraendert." },
  { value: "rename", label: "Zusaetzlich anlegen", hint: "Doppelte bekommen einen freien Slug." },
  { value: "overwrite", label: "Ersetzen", hint: "Stammdaten und Notizen werden ueberschrieben." },
];

const ACTION_LABEL: Record<ItemResult["action"], { text: string; className: string }> = {
  create: { text: "neu", className: "bg-emerald-500/12 text-emerald-200" },
  rename: { text: "zusaetzlich", className: "bg-cyan-500/12 text-cyan-200" },
  overwrite: { text: "ersetzt", className: "bg-amber-500/12 text-amber-200" },
  skip: { text: "uebersprungen", className: "bg-slate-500/12 text-slate-300" },
  error: { text: "Fehler", className: "bg-rose-500/12 text-rose-200" },
};

export function ImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [payload, setPayload] = useState<unknown>(null);
  const [strategy, setStrategy] = useState<Strategy>("skip");
  const [preview, setPreview] = useState<ImportResponse | null>(null);
  const [done, setDone] = useState<ImportResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setFileName(null);
    setPayload(null);
    setPreview(null);
    setDone(null);
    setError(null);
    setStrategy("skip");
    if (fileRef.current) fileRef.current.value = "";
  }

  function close() {
    reset();
    onClose();
  }

  async function pickFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setError(null);
    setPreview(null);
    setDone(null);
    setFileName(file.name);

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      setPayload(parsed);
      await run(parsed, strategy, true);
    } catch {
      setPayload(null);
      setError("Die Datei enthaelt kein gueltiges JSON.");
    }
  }

  async function run(data: unknown, chosen: Strategy, dryRun: boolean) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/projects/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data, strategy: chosen, dryRun }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Import fehlgeschlagen.");

      if (dryRun) setPreview(body as ImportResponse);
      else {
        setDone(body as ImportResponse);
        router.refresh();
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }

  async function changeStrategy(next: Strategy) {
    setStrategy(next);
    if (payload) await run(payload, next, true);
  }

  const summary = done?.summary ?? preview?.summary;
  const results = done?.results ?? preview?.results ?? [];

  // Wuerde der Import ueberhaupt etwas veraendern? Sonst waere der Knopf ein
  // Angebot, das ins Leere laeuft.
  const wouldChange = preview
    ? preview.summary.created + preview.summary.renamed + preview.summary.overwritten > 0
    : false;

  return (
    <Modal
      open={open}
      onClose={close}
      width="xl"
      title="Projekte importieren"
      description="Eine zuvor exportierte JSON-Datei einlesen. Vor dem Schreiben gibt es eine Vorschau."
    >
      <div className="space-y-5">
        {/* Datei */}
        <div>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            onChange={pickFile}
            className="hidden"
            id="import-file"
          />
          <button
            type="button"
            className="btn btn-ghost w-full justify-start py-3"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
          >
            <FileJson className="h-4 w-4 text-violet-300" />
            {fileName ?? "JSON-Datei auswaehlen…"}
          </button>
        </div>

        {/* Strategie */}
        {payload ? (
          <div>
            <span className="field-label">Bei gleichem Slug</span>
            <div className="grid gap-2 sm:grid-cols-3">
              {STRATEGIES.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  disabled={busy || Boolean(done)}
                  onClick={() => changeStrategy(option.value)}
                  className={cn(
                    "rounded-xl border px-3 py-2.5 text-left transition-all disabled:opacity-60",
                    strategy === option.value
                      ? "border-violet-400/60 bg-violet-500/12"
                      : "border-white/9 hover:border-white/20",
                  )}
                >
                  <span className="block text-sm text-slate-100">{option.label}</span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-slate-500">
                    {option.hint}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {error ? (
          <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
            {error}
          </p>
        ) : null}

        {/* Vorschau oder Ergebnis */}
        {summary ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-slate-400">
                {done ? "Ergebnis:" : "Vorschau:"} {summary.total} Projekt(e)
              </span>
              {summary.created > 0 ? <Chip tone="emerald">{summary.created} neu</Chip> : null}
              {summary.renamed > 0 ? <Chip tone="cyan">{summary.renamed} zusaetzlich</Chip> : null}
              {summary.overwritten > 0 ? (
                <Chip tone="amber">{summary.overwritten} ersetzt</Chip>
              ) : null}
              {summary.skipped > 0 ? <Chip tone="slate">{summary.skipped} uebersprungen</Chip> : null}
              {summary.errors > 0 ? <Chip tone="rose">{summary.errors} Fehler</Chip> : null}
            </div>

            {summary.missingConnections > 0 ? (
              <p className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  {summary.missingConnections} Projekt(e) verweisen auf eine Git-Verbindung,
                  die hier nicht existiert. Sie werden ohne Verknuepfung angelegt – lege die
                  Verbindung an und waehle sie im Projekt aus. Access Tokens sind in
                  Exportdateien grundsaetzlich nicht enthalten.
                </span>
              </p>
            ) : null}

            <div className="max-h-64 overflow-y-auto rounded-xl border border-white/8">
              {results.map((item) => {
                const label = ACTION_LABEL[item.action];
                return (
                  <div
                    key={`${item.slug}-${item.name}`}
                    className="flex items-center justify-between gap-3 border-b border-white/5 px-3 py-2 last:border-b-0"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm text-slate-200">{item.name}</p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 font-mono text-[11px] text-slate-500">
                        <span>{item.slug}</span>
                        {item.newSlug ? (
                          <>
                            <ArrowRight className="h-3 w-3" />
                            <span className="text-cyan-300">{item.newSlug}</span>
                          </>
                        ) : null}
                        <span className="text-slate-600">· {item.notes} Notizen</span>
                        {item.connection === "missing" ? (
                          <span className="text-amber-300/80">
                            · Verbindung „{item.connectionName}“ fehlt
                          </span>
                        ) : null}
                      </p>
                      {item.message ? (
                        <p className="mt-0.5 text-[11px] text-slate-600">{item.message}</p>
                      ) : null}
                    </div>
                    <span
                      className={cn(
                        "shrink-0 rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wider",
                        label.className,
                      )}
                    >
                      {label.text}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        {done ? (
          <p className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
            <CheckCircle2 className="h-4 w-4" />
            Import abgeschlossen.
          </p>
        ) : null}

        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-ghost" onClick={close} disabled={busy}>
            {done ? "Schliessen" : "Abbrechen"}
          </button>
          {!done ? (
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy || !wouldChange}
              title={
                preview && !wouldChange
                  ? "Mit dieser Strategie wuerde sich nichts aendern."
                  : undefined
              }
              onClick={() => payload && run(payload, strategy, false)}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Import ausfuehren
            </button>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}

function Chip({
  tone,
  children,
}: {
  tone: "emerald" | "cyan" | "amber" | "slate" | "rose";
  children: React.ReactNode;
}) {
  const tones = {
    emerald: "bg-emerald-500/12 text-emerald-200",
    cyan: "bg-cyan-500/12 text-cyan-200",
    amber: "bg-amber-500/12 text-amber-200",
    slate: "bg-slate-500/12 text-slate-300",
    rose: "bg-rose-500/12 text-rose-200",
  };
  return <span className={cn("rounded px-1.5 py-0.5", tones[tone])}>{children}</span>;
}
