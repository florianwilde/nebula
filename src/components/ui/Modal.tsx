"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ModalProps {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: "md" | "lg" | "xl";
}

/**
 * Dialog per Portal am body.
 *
 * Ohne Portal waere "position: fixed" wirkungslos: Dialoge werden aus Karten
 * heraus geoeffnet, und deren backdrop-filter erzeugt einen neuen
 * Bezugsrahmen. Der Dialog wuerde sich dann an der Karte ausrichten statt am
 * Fenster.
 */
export function Modal({
  open,
  title,
  description,
  onClose,
  children,
  footer,
  width = "lg",
}: ModalProps) {
  const [mounted, setMounted] = useState(false);
  const [sichtfenster, setSichtfenster] = useState<{ height: number; top: number } | null>(null);

  useEffect(() => setMounted(true), []);

  /**
   * Der Dialog richtet sich nach dem *sichtbaren* Fenster, nicht nach dem
   * Layoutfenster.
   *
   * Auf dem Telefon schiebt sich die Tastatur ueber die untere Haelfte,
   * ohne dass sich daran etwas fuer die Seite aendert: "position: fixed"
   * und "100vh" beziehen sich weiter auf das volle Fenster. Ein zentrierter
   * Dialog liegt damit zur Haelfte unter der Tastatur – genau dort, wo das
   * Eingabefeld ist.
   *
   * Die VisualViewport-API meldet, was wirklich zu sehen ist. Hoehe und
   * oberer Rand daraus zu setzen rueckt den Dialog in den freien Bereich,
   * und weil der Behaelter scrollbar ist, holt der Browser das fokussierte
   * Feld von selbst ins Bild.
   */
  useEffect(() => {
    if (!open) return;
    const fenster = window.visualViewport;
    if (!fenster) return;

    const nachfuehren = () => {
      setSichtfenster({ height: fenster.height, top: fenster.offsetTop });
    };
    nachfuehren();

    fenster.addEventListener("resize", nachfuehren);
    // Beim Scrollen mit offener Tastatur wandert der sichtbare Ausschnitt.
    fenster.addEventListener("scroll", nachfuehren);
    return () => {
      fenster.removeEventListener("resize", nachfuehren);
      fenster.removeEventListener("scroll", nachfuehren);
      setSichtfenster(null);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!mounted || !open) return null;

  return createPortal(
    <div
      className="fixed inset-x-0 z-[120] flex items-start justify-center overflow-y-auto p-3 sm:p-8"
      style={
        sichtfenster
          ? { top: sichtfenster.top, height: sichtfenster.height }
          : { top: 0, bottom: 0 }
      }
    >
      <button
        type="button"
        aria-label="Dialog schliessen"
        onClick={onClose}
        className="fixed inset-0 cursor-default bg-[#03040c]/85 backdrop-blur-sm"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "popover fade-up relative z-10 my-auto w-full rounded-2xl p-4 sm:p-6",
          width === "md" && "max-w-lg",
          width === "lg" && "max-w-2xl",
          width === "xl" && "max-w-4xl",
        )}
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-white">{title}</h2>
            {description ? (
              <p className="mt-1 text-sm text-slate-400">{description}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-white/8 hover:text-white"
            aria-label="Schliessen"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {children}

        {footer ? <div className="mt-6 flex justify-end gap-2">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}
