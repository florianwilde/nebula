import type { ProviderKind } from "./types";

/**
 * Reine Metadaten zu den Git-Systemen – bewusst frei von Node-Imports,
 * damit dieses Modul auch in Client-Komponenten benutzt werden kann.
 */
export const PROVIDER_META: Record<
  ProviderKind,
  { label: string; defaultBaseUrl: string; tokenHelp: string; docsUrl: string }
> = {
  GITHUB: {
    label: "GitHub",
    defaultBaseUrl: "https://github.com",
    tokenHelp:
      "Fine-grained Token mit Lesezugriff auf Contents, Metadata, Issues und Pull Requests.",
    docsUrl: "https://github.com/settings/tokens",
  },
  GITLAB: {
    label: "GitLab",
    defaultBaseUrl: "https://gitlab.com",
    tokenHelp: "Personal Access Token mit Scope 'read_api' (bzw. 'read_repository').",
    docsUrl: "https://gitlab.com/-/user_settings/personal_access_tokens",
  },
  GITEA: {
    label: "Gitea / Forgejo",
    defaultBaseUrl: "https://git.example.com",
    tokenHelp: "Access Token mit Leserechten auf repository, issue und user.",
    docsUrl: "https://docs.gitea.com/development/api-usage",
  },
};

export function guessProvider(host: string): ProviderKind {
  const lower = host.toLowerCase();
  if (lower.includes("github")) return "GITHUB";
  if (lower.includes("gitlab")) return "GITLAB";
  return "GITEA";
}
