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

export function Markdown({
  children,
  className,
}: {
  children: string | null | undefined;
  className?: string;
}) {
  if (!children?.trim()) return null;

  return (
    <div className={cn("md", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeSanitize, schema]]}
        components={{
          // Links aus fremdem Inhalt immer in neuem Tab und ohne
          // Zugriff auf das oeffnende Fenster.
          a: ({ href, children: content }) => (
            <a href={href} target="_blank" rel="noreferrer noopener nofollow">
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
