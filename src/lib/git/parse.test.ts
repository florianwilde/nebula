import { describe, expect, it } from "vitest";
import { guessProvider } from "./meta";
import { parseRepoUrl } from "./index";
import { ACTIVITY_DAYS, bucketCommitActivity } from "./types";

describe("parseRepoUrl", () => {
  it("zerlegt eine gewoehnliche https-URL", () => {
    expect(parseRepoUrl("https://github.com/vercel/swr")).toMatchObject({
      host: "github.com",
      owner: "vercel",
      name: "swr",
      guessedProvider: "GITHUB",
    });
  });

  it("entfernt die Endung .git", () => {
    expect(parseRepoUrl("https://github.com/vercel/swr.git")?.name).toBe("swr");
  });

  it("versteht SSH-Adressen", () => {
    expect(parseRepoUrl("git@gitlab.com:gruppe/projekt.git")).toMatchObject({
      host: "gitlab.com",
      owner: "gruppe",
      name: "projekt",
      guessedProvider: "GITLAB",
    });
  });

  it("behaelt verschachtelte GitLab-Gruppen", () => {
    expect(parseRepoUrl("https://gitlab.com/gruppe/untergruppe/projekt")).toMatchObject({
      owner: "gruppe/untergruppe",
      name: "projekt",
    });
  });

  it("schneidet GitLab-Oberflaechenpfade ab dem /-/ ab", () => {
    expect(parseRepoUrl("https://gitlab.com/gruppe/projekt/-/tree/main")).toMatchObject({
      owner: "gruppe",
      name: "projekt",
    });
  });

  it("kommt mit einer eigenen Gitea-Instanz zurecht", () => {
    expect(parseRepoUrl("https://git.meine-firma.de/team/repo")).toMatchObject({
      baseUrl: "https://git.meine-firma.de",
      owner: "team",
      name: "repo",
      guessedProvider: "GITEA",
    });
  });

  it("gibt null zurueck, wenn kein Repository erkennbar ist", () => {
    expect(parseRepoUrl("https://github.com/nurbenutzer")).toBeNull();
    expect(parseRepoUrl("")).toBeNull();
    expect(parseRepoUrl("kein-url-artiger-text")).toBeNull();
  });
});

describe("guessProvider", () => {
  it("erkennt die grossen beiden am Hostnamen", () => {
    expect(guessProvider("github.com")).toBe("GITHUB");
    expect(guessProvider("gitlab.example.org")).toBe("GITLAB");
  });

  it("nimmt bei allem anderen Gitea an", () => {
    expect(guessProvider("git.meine-firma.de")).toBe("GITEA");
  });
});

describe("bucketCommitActivity", () => {
  const dayMs = 24 * 60 * 60 * 1000;
  const daysAgo = (days: number) => new Date(Date.now() - days * dayMs).toISOString();

  it("liefert ohne Commits den vollen Zeitraum", () => {
    expect(bucketCommitActivity([])).toHaveLength(ACTIVITY_DAYS);
  });

  it("sortiert den juengsten Commit ans Ende", () => {
    const buckets = bucketCommitActivity([daysAgo(29), daysAgo(0)]);
    expect(buckets).toHaveLength(ACTIVITY_DAYS);
    expect(buckets[ACTIVITY_DAYS - 1]).toBe(1);
  });

  it("zaehlt mehrere Commits desselben Tages zusammen", () => {
    const buckets = bucketCommitActivity([daysAgo(29), daysAgo(2), daysAgo(2), daysAgo(2)]);
    expect(buckets[buckets.length - 3]).toBe(3);
  });

  it("kuerzt auf den belegten Zeitraum, statt Unbekanntes als Null zu zeigen", () => {
    // Reicht die geholte Historie nur fuenf Tage zurueck, duerfen die
    // 25 Tage davor nicht als "keine Commits" erscheinen.
    const buckets = bucketCommitActivity([daysAgo(4), daysAgo(0)]);
    expect(buckets).toHaveLength(5);
    expect(buckets[0]).toBe(1);
    expect(buckets[4]).toBe(1);
  });

  it("ignoriert unlesbare Werte", () => {
    const buckets = bucketCommitActivity([null, "voelliger Unsinn"]);
    expect(buckets).toHaveLength(ACTIVITY_DAYS);
    expect(buckets.every((value) => value === 0)).toBe(true);
  });

  it("laesst aeltere Commits den vollen Zeitraum aufspannen", () => {
    const buckets = bucketCommitActivity([daysAgo(100), daysAgo(1)]);
    expect(buckets).toHaveLength(ACTIVITY_DAYS);
    expect(buckets[ACTIVITY_DAYS - 2]).toBe(1);
  });
});
