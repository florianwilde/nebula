import { describe, expect, it } from "vitest";
import { PROVIDER_META, guessProvider } from "./meta";

const PROVIDER = ["GITHUB", "GITLAB", "GITEA"] as const;

describe("PROVIDER_META", () => {
  it("kennt jedes unterstuetzte System", () => {
    for (const provider of PROVIDER) {
      expect(PROVIDER_META[provider], provider).toBeDefined();
    }
    // Und nichts darueber hinaus – ein Eintrag ohne Gegenstueck im Schema
    // waere ein Ueberbleibsel.
    expect(Object.keys(PROVIDER_META).sort()).toEqual([...PROVIDER].sort());
  });

  it("hat zu jedem System Beschriftung, Basis-URL und Dokuverweis", () => {
    for (const provider of PROVIDER) {
      const meta = PROVIDER_META[provider];
      expect(meta.label.length, provider).toBeGreaterThan(0);
      expect(meta.defaultBaseUrl, provider).toMatch(/^https:\/\//);
      expect(meta.docsUrl, provider).toMatch(/^https:\/\//);
    }
  });

  /**
   * Der eigentliche Waechter.
   *
   * Der Hinweis am Eingabefeld war eine Zeit lang rein lesend formuliert,
   * obwohl Nebula seit v1.7.0 Issues anlegt und schliesst – wer sich daran
   * hielt, bekam einen 403. Jeder Provider in GitClient muss createIssue und
   * setIssueState koennen; folglich muss auch jeder Hinweis sagen, was das
   * an Rechten kostet.
   */
  it("sagt bei jedem System etwas ueber die Rechte fuer Issues", () => {
    for (const provider of PROVIDER) {
      expect(PROVIDER_META[provider].tokenHelp, provider).toMatch(/issue/i);
    }
  });

  it("nennt einen konkreten Scope statt nur 'Leserechte'", () => {
    // GitLab nennt Scopes in Anfuehrungszeichen, GitHub und Gitea
    // Berechtigungsnamen – gemeinsam ist, dass etwas Nachschlagbares dasteht.
    expect(PROVIDER_META.GITLAB.tokenHelp).toMatch(/read_api/);
    expect(PROVIDER_META.GITEA.tokenHelp).toMatch(/read:repository/);
    expect(PROVIDER_META.GITHUB.tokenHelp).toMatch(/Metadata/);
  });
});

describe("guessProvider", () => {
  it("erkennt die oeffentlichen Instanzen am Hostnamen", () => {
    expect(guessProvider("github.com")).toBe("GITHUB");
    expect(guessProvider("gitlab.com")).toBe("GITLAB");
  });

  it("faellt bei allem anderen auf Gitea zurueck", () => {
    // Selbst gehostet ist hier der haeufigste Fall, und Gitea die
    // wahrscheinlichste Wahl dafuer.
    expect(guessProvider("git.wilde-server.de")).toBe("GITEA");
  });
});
