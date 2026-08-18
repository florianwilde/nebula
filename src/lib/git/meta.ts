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
      "Fine-grained Token, alle nur lesend: Metadata, Contents, Issues, Pull requests " +
      "und Actions. Nur wenn Aufgaben als Issue angelegt werden sollen, Issues " +
      "zusaetzlich schreiben.",
    docsUrl: "https://github.com/settings/tokens",
  },
  GITLAB: {
    label: "GitLab",
    defaultBaseUrl: "https://gitlab.com",
    tokenHelp:
      "Scope 'read_api' genuegt fuer den Abgleich. Aufgaben als Issue anzulegen verlangt " +
      "'api' – GitLab kennt keinen schmaleren Schreibzugriff.",
    docsUrl: "https://gitlab.com/-/user_settings/personal_access_tokens",
  },
  GITEA: {
    label: "Gitea / Forgejo",
    defaultBaseUrl: "https://git.example.com",
    tokenHelp:
      "read:repository, read:issue und read:user. Nur wenn Aufgaben als Issue angelegt " +
      "werden sollen, zusaetzlich write:issue.",
    docsUrl: "https://docs.gitea.com/development/api-usage",
  },
};

/**
 * Wie ein Repository in Ueberschriften und Meldungen heisst.
 *
 * Steht hier und nicht bei den uebrigen Repository-Helfern, weil die
 * Oberflaeche sie braucht: lib/repositories zieht Prisma und damit
 * node:-Module nach, die in einer Client-Komponente nicht landen duerfen.
 */
export function repoTitle(repo: {
  label?: string | null;
  repoOwner?: string | null;
  repoName?: string | null;
  repoUrl?: string | null;
}): string {
  if (repo.label) return repo.label;
  if (repo.repoOwner && repo.repoName) return `${repo.repoOwner}/${repo.repoName}`;
  if (repo.repoName) return repo.repoName;
  return repo.repoUrl ?? "Repository";
}

export function guessProvider(host: string): ProviderKind {
  const lower = host.toLowerCase();
  if (lower.includes("github")) return "GITHUB";
  if (lower.includes("gitlab")) return "GITLAB";
  return "GITEA";
}
