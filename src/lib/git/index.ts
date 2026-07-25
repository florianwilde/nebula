import type { GitConnection } from "@prisma/client";
import { tryDecryptSecret } from "@/lib/crypto";
import { GiteaClient } from "./gitea";
import { GitHubClient } from "./github";
import { GitLabClient } from "./gitlab";
import { guessProvider } from "./meta";
import type { GitClient, ProviderConfig, ProviderKind, RepoRef } from "./types";

export * from "./types";
export { GiteaClient, GitHubClient, GitLabClient };
// PROVIDER_META liegt in ./meta, damit Client-Komponenten es ohne
// node:crypto-Abhaengigkeit importieren koennen.
export { PROVIDER_META, guessProvider } from "./meta";

export function createClient(config: ProviderConfig): GitClient {
  switch (config.provider) {
    case "GITHUB":
      return new GitHubClient(config);
    case "GITLAB":
      return new GitLabClient(config);
    case "GITEA":
      return new GiteaClient(config);
    default: {
      const exhaustive: never = config.provider;
      throw new Error(`Unbekannter Provider: ${String(exhaustive)}`);
    }
  }
}

/** Baut einen Client aus einer gespeicherten Verbindung (Token wird entschluesselt). */
export function clientForConnection(connection: GitConnection): GitClient {
  return createClient({
    provider: connection.provider,
    baseUrl: connection.baseUrl,
    token: tryDecryptSecret(connection.tokenCipher),
  });
}

export interface ParsedRepoUrl {
  host: string;
  baseUrl: string;
  owner: string;
  name: string;
  /** Aus dem Host geratener Provider – vom Nutzer ueberschreibbar. */
  guessedProvider: ProviderKind;
}

/**
 * Zerlegt eine Repository-URL. Unterstuetzt:
 *   https://github.com/user/repo(.git)
 *   git@gitlab.com:gruppe/subgruppe/repo.git
 *   https://git.firma.de/team/repo
 */
export function parseRepoUrl(input: string): ParsedRepoUrl | null {
  const raw = input.trim();
  if (!raw) return null;

  let host = "";
  let path = "";
  let protocol = "https";

  const sshMatch = raw.match(/^(?:ssh:\/\/)?(?:[\w.-]+@)([^/:]+)[:/](.+)$/);
  if (sshMatch && !raw.startsWith("http")) {
    host = sshMatch[1];
    path = sshMatch[2];
  } else {
    try {
      const url = new URL(raw.includes("://") ? raw : `https://${raw}`);
      host = url.host;
      path = url.pathname;
      protocol = url.protocol.replace(":", "") || "https";
    } catch {
      return null;
    }
  }

  const segments = path
    .replace(/\.git$/i, "")
    .split("/")
    .filter(Boolean)
    // GitLab-Weboberflaeche haengt bei Unterseiten "/-/tree/main" an.
    .reduce<string[]>((acc, segment) => {
      if (segment === "-") return acc.length ? [...acc, "__STOP__"] : acc;
      if (acc.includes("__STOP__")) return acc;
      return [...acc, segment];
    }, [])
    .filter((segment) => segment !== "__STOP__");

  if (segments.length < 2) return null;

  const name = segments[segments.length - 1];
  const owner = segments.slice(0, -1).join("/");

  return {
    host,
    baseUrl: `${protocol}://${host}`,
    owner,
    name,
    guessedProvider: guessProvider(host),
  };
}

export function repoRefFrom(owner: string, name: string): RepoRef {
  return { owner, name };
}
