import { describe, expect, it } from "vitest";
import { repoTitle } from "./git/meta";
import { completeRepoInput, namesRepository } from "./repositories";

describe("completeRepoInput", () => {
  it("leitet Owner und Name aus der URL ab", () => {
    expect(completeRepoInput({ repoUrl: "https://github.com/vercel/swr" })).toMatchObject({
      repoOwner: "vercel",
      repoName: "swr",
    });
  });

  it("laesst ausdruecklich gesetzte Werte in Ruhe", () => {
    // Bei GitLab-Untergruppen weiss der Benutzer es besser als die Ableitung.
    expect(
      completeRepoInput({
        repoUrl: "https://gitlab.com/gruppe/untergruppe/dings",
        repoOwner: "gruppe/untergruppe",
        repoName: "dings",
      }),
    ).toMatchObject({ repoOwner: "gruppe/untergruppe", repoName: "dings" });
  });

  it("kommt ohne URL und mit unbrauchbarer URL zurecht", () => {
    expect(completeRepoInput({ repoOwner: "a", repoName: "b" }).repoUrl).toBeUndefined();
    expect(completeRepoInput({ repoUrl: "kein-link" }).repoOwner).toBeUndefined();
  });
});

describe("namesRepository", () => {
  it("erkennt, wann ueberhaupt ein Repo benannt wurde", () => {
    expect(namesRepository({ repoUrl: "https://github.com/a/b" })).toBe(true);
    expect(namesRepository({ repoOwner: "a", repoName: "b" })).toBe(true);
  });

  it("laesst Halbes nicht durchgehen", () => {
    // Ein Owner ohne Namen ergibt kein Repository, sondern eine leere Zeile.
    expect(namesRepository({})).toBe(false);
    expect(namesRepository({ repoOwner: "a" })).toBe(false);
    expect(namesRepository({ label: "Frontend" })).toBe(false);
  });
});

describe("repoTitle", () => {
  it("zieht die Bezeichnung allem anderen vor", () => {
    expect(repoTitle({ label: "Frontend", repoOwner: "a", repoName: "b" })).toBe("Frontend");
  });

  it("faellt ueber owner/name auf die URL zurueck", () => {
    expect(repoTitle({ repoOwner: "vercel", repoName: "swr" })).toBe("vercel/swr");
    expect(repoTitle({ repoName: "swr" })).toBe("swr");
    expect(repoTitle({ repoUrl: "https://example.com/x" })).toBe("https://example.com/x");
    expect(repoTitle({})).toBe("Repository");
  });
});
