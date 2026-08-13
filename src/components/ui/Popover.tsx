"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

/**
 * Schwebendes Menue, das per Portal am body haengt.
 *
 * Warum nicht einfach ein absolut positioniertes Kind?
 *
 *  1. Unsere Karten setzen overflow-hidden (fuer den Akzentstreifen und den
 *     Farbverlaufsrand). Ein Kind wuerde daran abgeschnitten.
 *  2. .glass setzt backdrop-filter, und die Projektkarte bekommt beim Hovern
 *     ein transform. Beides erzeugt einen Stacking-Context und einen neuen
 *     Bezugsrahmen: z-index wirkt dann nur noch innerhalb der Karte, und
 *     selbst position: fixed bezieht sich auf die Karte statt auf das
 *     Fenster.
 *
 * Am body haengend entfaellt beides. Die Position wird aus dem Ankerelement
 * berechnet und beim Scrollen und bei Groessenaenderungen nachgefuehrt.
 */
export function Popover({
  anchorRef,
  open,
  onClose,
  children,
  align = "end",
  width = 240,
  className,
  labelledBy,
  role = "menu",
}: {
  anchorRef: React.RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** "end" richtet die rechte Kante am Anker aus. */
  align?: "start" | "end";
  width?: number;
  className?: string;
  labelledBy?: string;
  role?: "menu" | "listbox" | "dialog";
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [position, setPosition] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);

  useEffect(() => setMounted(true), []);

  const place = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;

    const rect = anchor.getBoundingClientRect();
    const margin = 8;
    const gap = 6;

    // Passt die Wunschbreite nicht ins Fenster, gilt das Fenster. Sonst
    // liefert die Klemmung unten eine negative linke Kante und das Menue
    // stuende zur Haelfte ausserhalb des Bildschirms.
    const effektiv = Math.min(width, window.innerWidth - 2 * margin);

    // Bevorzugte Ausrichtung, bei Ueberlauf auf die andere Seite wechseln.
    // Nur Festklemmen am Fensterrand waere schlecht: bei einem Ausloeser weit
    // links stuende das Menue sonst quer ueber der Seite statt an seinem
    // Ausloeser.
    let left = align === "end" ? rect.right - effektiv : rect.left;
    if (left < margin) left = rect.left;
    if (left + effektiv > window.innerWidth - margin) left = rect.right - effektiv;
    left = Math.min(Math.max(margin, left), window.innerWidth - effektiv - margin);

    const panelHeight = panelRef.current?.offsetHeight ?? 0;
    let top = rect.bottom + gap;

    // Nach oben klappen, wenn unten kein Platz ist, oben aber schon.
    const fitsBelow = top + panelHeight <= window.innerHeight - margin;
    const fitsAbove = rect.top - gap - panelHeight >= margin;
    if (!fitsBelow && fitsAbove) top = rect.top - gap - panelHeight;

    setPosition({ top, left, width: effektiv });
  }, [anchorRef, align, width]);

  // Bewusst useEffect statt useLayoutEffect: Letzteres warnt beim
  // Server-Rendering. Ein Aufblitzen an falscher Stelle gibt es trotzdem
  // nicht, weil das Panel bis zur berechneten Position unsichtbar bleibt.
  useEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }
    place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;

    // capture: true, damit auch das Scrollen innerer Container ankommt.
    const onScroll = () => place();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);

    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (panelRef.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return;
      onClose();
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);

    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, place, onClose, anchorRef]);

  if (!mounted || !open) return null;

  return createPortal(
    <div
      ref={panelRef}
      role={role}
      aria-labelledby={labelledBy}
      style={{
        position: "fixed",
        top: position?.top ?? -9999,
        left: position?.left ?? -9999,
        width: position?.width ?? width,
        // Bis die Position steht, unsichtbar halten – sonst blitzt das
        // Menue kurz an der falschen Stelle auf.
        visibility: position ? "visible" : "hidden",
      }}
      className={cn("popover fade-up z-[100] overflow-hidden p-1.5", className)}
    >
      {children}
    </div>,
    document.body,
  );
}
