"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import { cn } from "@/lib/utils";

/**
 * Markdown-Darstellung fuer Beschreibungen und Notizen.
 *
 * Der Inhalt stammt vom Benutzer, wird aber unveraendert gerendert – ohne
 * rehype-sanitize waere das ein XSS-Loch, sobald jemand rohes HTML in eine
 * Notiz schreibt. Das Standardschema erlaubt nur harmlose Elemente; ergaenzt
 * wird lediglich, was fuer Aufgabenlisten und Codebloecke noetig ist.
 */
const schema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    // Checkboxen aus "- [ ] Aufgabe"
    input: [...(defaultSchema.attributes?.input ?? []), "checked", "disabled", "type"],
    // Sprachklassen wie "language-ts" fuer Codebloecke
    code: [...(defaultSchema.attributes?.code ?? []), ["className", /^language-./]],
  },
};

/** Loest relative Verweise gegen die Basis auf; laesst absolute in Ruhe. */
function absolut(href: string | undefined, base: string | null | undefined): string | undefined {
  if (!href || !base) return href;
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("//") || href.startsWith("#")) {
    return href;
  }
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
}

type HastNode = {
  type: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
  value?: string;
};

/**
 * Ersetzt Bilder durch eine anklickbare Marke – siehe die Begruendung
 * unten am `.md-image`-Stil.
 *
 * Das passiert im Baum und nicht ueber eine Komponente, weil es auf den
 * Elternknoten ankommt: `[![Abzeichen](bild)](ziel)` ist in READMEs die
 * Regel, und ein `<a>` in einem `<a>` ist ungueltiges HTML. Der Browser
 * zieht es beim Parsen auseinander, was zu einem Hydrationsfehler fuehrt –
 * genau daran ist es beim ersten Versuch gescheitert. Innerhalb eines Links
 * bleibt deshalb nur der Text stehen; der umgebende Link ist ohnehin das,
 * was man anklicken will.
 */
function bilderAlsMarke(base: string | null | undefined) {
  return () => (tree: HastNode) => {
    const gehe = (knoten: HastNode, inLink: boolean) => {
      const kinder = knoten.children;
      if (!kinder) return;

      for (let index = 0; index < kinder.length; index += 1) {
        const kind = kinder[index];

        if (kind.type === "element" && kind.tagName === "img") {
          const quelle = typeof kind.properties?.src === "string" ? kind.properties.src : undefined;
          const alt = typeof kind.properties?.alt === "string" ? kind.properties.alt.trim() : "";
          const text: HastNode = { type: "text", value: alt || "Bild" };
          const ziel = absolut(quelle, base);

          kinder[index] =
            inLink || !ziel
              ? { type: "element", tagName: "span", properties: { className: ["md-image"] }, children: [text] }
              : {
                  type: "element",
                  tagName: "a",
                  properties: {
                    className: ["md-image"],
                    href: ziel,
                    title: ziel,
                    target: "_blank",
                    rel: "noreferrer noopener nofollow",
                  },
                  children: [text],
                };
          continue;
        }

        gehe(kind, inLink || (kind.type === "element" && kind.tagName === "a"));
      }
    };

    gehe(tree, false);
  };
}

export function Markdown({
  children,
  className,
  baseUrl,
}: {
  children: string | null | undefined;
  className?: string;
  /**
   * Wogegen relative Verweise aufzuloesen sind. Gesetzt beim README aus
   * einem Repository – dort zeigen Links auf Dateien daneben, die ohne
   * Basis ins Leere liefen.
   */
  baseUrl?: string | null;
}) {
  if (!children?.trim()) return null;

  return (
    <div className={cn("md", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        // Erst bereinigen, dann umbauen: die Marke soll nicht selbst durch
        // die Bereinigung laufen und dabei ihre Klassen verlieren.
        rehypePlugins={[[rehypeSanitize, schema], bilderAlsMarke(baseUrl)]}
        components={{
          // Links aus fremdem Inhalt immer in neuem Tab und ohne
          // Zugriff auf das oeffnende Fenster.
          // className muss durchgereicht werden, sonst verlieren die
          // Bildmarken aus dem Umbau oben ihre Gestalt.
          a: ({ href, className: klasse, title, children: content }) => (
            <a
              href={absolut(href, baseUrl)}
              className={klasse}
              title={title}
              target="_blank"
              rel="noreferrer noopener nofollow"
            >
              {content}
            </a>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
