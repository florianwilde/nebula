import { expect, test, type APIRequestContext } from "@playwright/test";

/**
 * Tests ueber HTTP gegen die laufende Anwendung – also durch Middleware,
 * Authentifizierung, Validierung und Datenbank hindurch. Genau die Dinge,
 * die Unit-Tests nicht erreichen.
 *
 * Die Tests bauen aufeinander auf und laufen in dieser Reihenfolge, weil sie
 * sich eine Datenbank teilen (siehe playwright.config.ts, workers: 1).
 */

const ADMIN = { username: "chefin", password: "ein-langes-testpasswort" };
const ZWEITER = { username: "zweiter", password: "noch-ein-langes-passwort" };

async function login(request: APIRequestContext, user: { username: string; password: string }) {
  const response = await request.post("/api/auth/login", { data: user });
  expect(response.ok(), `Anmeldung als ${user.username}`).toBeTruthy();
}

test.describe.configure({ mode: "serial" });

test("Einrichtung legt das erste Konto an und sperrt sich danach", async ({ request }) => {
  const response = await request.post("/api/auth/setup", {
    data: { ...ADMIN, mode: "MULTI_USER" },
  });
  expect(response.status()).toBe(200);
  expect((await response.json()).user.role).toBe("ADMIN");

  // Ein zweiter Aufruf darf kein weiteres Adminkonto erzeugen.
  const wieder = await request.post("/api/auth/setup", {
    data: { username: "eindringling", password: "ein-langes-testpasswort" },
  });
  expect(wieder.status()).toBe(409);
});

test("ohne Anmeldung ist nichts zu holen", async ({ playwright }) => {
  const anonym = await playwright.request.newContext({ baseURL: test.info().project.use.baseURL });
  for (const pfad of ["/api/projects", "/api/connections", "/api/admin/users"]) {
    expect((await anonym.get(pfad)).status(), pfad).toBe(401);
  }
  await anonym.dispose();
});

test("Fremdes Origin wird abgewiesen", async ({ request }) => {
  await login(request, ADMIN);
  const response = await request.post("/api/projects", {
    data: { name: "Von woanders" },
    headers: { Origin: "https://boese.example" },
  });
  expect(response.status()).toBe(403);
});

test("Content-Type wird erzwungen", async ({ request }) => {
  await login(request, ADMIN);
  const response = await request.post("/api/projects", {
    headers: { "Content-Type": "text/plain" },
    data: JSON.stringify({ name: "Umgehung" }),
  });
  expect(response.status()).toBe(415);
});

test("SSRF: interne Adressen werden geblockt", async ({ request }) => {
  await login(request, ADMIN);
  for (const ziel of ["http://127.0.0.1:5432", "http://169.254.169.254", "http://0.0.0.0"]) {
    const response = await request.post("/api/connections", {
      data: { name: `ssrf-${ziel}`, provider: "GITEA", baseUrl: ziel },
    });
    expect(response.status(), ziel).toBe(422);
  }
});

test("Datentrennung zwischen zwei Konten", async ({ request, playwright }) => {
  await login(request, ADMIN);

  const angelegt = await request.post("/api/projects", {
    data: { name: "Geheimprojekt", status: "IN_DEVELOPMENT" },
  });
  expect(angelegt.status()).toBe(201);
  const projektId = (await angelegt.json()).project.id;

  const aufgabe = await request.post(`/api/projects/${projektId}/tasks`, {
    data: { title: "Nicht fuer fremde Augen" },
  });
  expect(aufgabe.status()).toBe(201);
  const aufgabenId = (await aufgabe.json()).task.id;

  // Zweites Konto anlegen und in einem eigenen Kontext anmelden.
  const neu = await request.post("/api/admin/users", {
    data: { ...ZWEITER, role: "USER" },
  });
  expect(neu.status()).toBe(201);

  const fremd = await playwright.request.newContext({
    baseURL: test.info().project.use.baseURL,
  });
  await login(fremd, ZWEITER);

  expect((await (await fremd.get("/api/projects")).json()).projects).toHaveLength(0);

  // Fremde IDs muessen 404 liefern, nicht 403 – sonst waere die Existenz
  // des Datensatzes bestaetigt.
  expect((await fremd.get(`/api/projects/${projektId}`)).status()).toBe(404);
  expect(
    (await fremd.patch(`/api/projects/${projektId}`, { data: { name: "uebernommen" } })).status(),
  ).toBe(404);
  expect((await fremd.delete(`/api/projects/${projektId}`)).status()).toBe(404);
  expect((await fremd.get(`/api/projects/${projektId}/tasks`)).status()).toBe(404);
  expect((await fremd.patch(`/api/tasks/${aufgabenId}`, { data: { title: "x" } })).status()).toBe(
    404,
  );

  // Adminwege bleiben zu.
  expect((await fremd.get("/api/admin/users")).status()).toBe(403);
  expect(
    (await fremd.patch("/api/admin/settings", { data: { mode: "SINGLE_USER" } })).status(),
  ).toBe(403);

  // Und das Original ist unveraendert.
  const danach = await (await request.get(`/api/projects/${projektId}`)).json();
  expect(danach.project.name).toBe("Geheimprojekt");
  expect(danach.project.tasks).toHaveLength(1);

  await fremd.dispose();
});

test("Aufgaben: Reihenfolge, abgeleiteter Fortschritt, fremde IDs", async ({ request }) => {
  await login(request, ADMIN);

  const projekt = (
    await (await request.post("/api/projects", { data: { name: "Aufgabenprojekt" } })).json()
  ).project;

  const titel = ["eins", "zwei", "drei"];
  const ids: string[] = [];
  for (const title of titel) {
    const response = await request.post(`/api/projects/${projekt.id}/tasks`, {
      data: { title, status: "TODO" },
    });
    ids.push((await response.json()).task.id);
  }

  // Neue Aufgaben haengen sich hinten an.
  const angelegt = (await (await request.get(`/api/projects/${projekt.id}/tasks`)).json()).tasks;
  expect(angelegt.map((task: { position: number }) => task.position)).toEqual([0, 1, 2]);

  // Umdrehen.
  const gedreht = [...ids].reverse();
  const reorder = await request.patch(`/api/projects/${projekt.id}/tasks/reorder`, {
    data: { columns: { TODO: gedreht } },
  });
  expect(reorder.ok()).toBeTruthy();
  const nachher = (await (await request.get(`/api/projects/${projekt.id}/tasks`)).json()).tasks;
  expect(nachher.map((task: { title: string }) => task.title)).toEqual(["drei", "zwei", "eins"]);

  // Eine nach DONE – Fortschritt folgt, sobald eingeschaltet.
  await request.patch(`/api/projects/${projekt.id}`, { data: { progressFromTasks: true } });
  await request.patch(`/api/tasks/${ids[0]}`, { data: { status: "DONE" } });

  const mitFortschritt = (
    await (await request.get(`/api/projects/${projekt.id}`)).json()
  ).project;
  expect(mitFortschritt.progress).toBe(33);

  // Eine ID aus einem anderen Projekt darf nicht verschoben werden.
  const anderes = (
    await (await request.post("/api/projects", { data: { name: "Anderes" } })).json()
  ).project;
  const fremdeAufgabe = (
    await (
      await request.post(`/api/projects/${anderes.id}/tasks`, { data: { title: "fremd" } })
    ).json()
  ).task;

  const untergeschoben = await request.patch(`/api/projects/${projekt.id}/tasks/reorder`, {
    data: { columns: { DOING: [fremdeAufgabe.id] } },
  });
  const ergebnis = await untergeschoben.json();
  expect(ergebnis.updated).toBe(0);
  expect(ergebnis.ignored).toBe(1);

  const unveraendert = (
    await (await request.get(`/api/projects/${anderes.id}/tasks`)).json()
  ).tasks[0];
  expect(unveraendert.status).toBe("TODO");
});

test("Issues als Aufgaben uebernehmen, ohne Dubletten", async ({ request }) => {
  await login(request, ADMIN);

  const projekt = (
    await (await request.post("/api/projects", { data: { name: "Issue-Projekt" } })).json()
  ).project;

  // Ohne verknuepftes Repository gibt es nichts zu uebernehmen.
  const ohneRepo = await request.post(`/api/projects/${projekt.id}/tasks/from-issues`, {
    data: {},
  });
  expect(ohneRepo.status()).toBe(409);

  // Mit Repository, aber ohne geholten Stand ebenfalls nicht – der Server
  // laedt hier bewusst nichts nach.
  await request.patch(`/api/projects/${projekt.id}`, {
    data: { repoUrl: "https://github.com/vercel/swr" },
  });
  const ohneStand = await request.post(`/api/projects/${projekt.id}/tasks/from-issues`, {
    data: {},
  });
  expect(ohneStand.status()).toBe(409);

  // Nach einem bestimmten, das es nicht gibt, ist dagegen 404 richtig.
  const fremdesRepo = await request.post(`/api/projects/${projekt.id}/tasks/from-issues`, {
    data: { repositoryId: "gibt-es-nicht" },
  });
  expect(fremdesRepo.status()).toBe(404);
});

test("Mehrere Repositories je Projekt", async ({ request, playwright }) => {
  await login(request, ADMIN);

  // Beim Anlegen setzen die Git-Felder das fuehrende Repository.
  const projekt = (
    await (
      await request.post("/api/projects", {
        data: { name: "Zwei Teile", repoUrl: "https://github.com/vercel/swr" },
      })
    ).json()
  ).project;

  expect(projekt.repositories).toHaveLength(1);
  expect(projekt.repositories[0].repoOwner).toBe("vercel");
  expect(projekt.repositories[0].repoName).toBe("swr");

  // Ein zweites dazu.
  const zweites = await request.post(`/api/projects/${projekt.id}/repositories`, {
    data: { label: "Backend", repoUrl: "https://github.com/vercel/next.js" },
  });
  expect(zweites.status()).toBe(201);
  const backendId = (await zweites.json()).repository.id;

  // Dasselbe Repo zweimal ist immer ein Versehen.
  const doppelt = await request.post(`/api/projects/${projekt.id}/repositories`, {
    data: { repoUrl: "https://github.com/vercel/next.js" },
  });
  expect(doppelt.status()).toBe(409);

  // Halbe Angaben ergeben kein Repository.
  const leer = await request.post(`/api/projects/${projekt.id}/repositories`, {
    data: { label: "Nur ein Name" },
  });
  expect(leer.status()).toBe(422);

  const geladen = (await (await request.get(`/api/projects/${projekt.id}`)).json()).project;
  expect(geladen.repositories).toHaveLength(2);
  // Das fuehrende steht vorn.
  expect(geladen.repositories[0].repoName).toBe("swr");
  expect(geladen.repositories[1].label).toBe("Backend");

  // Der Projekt-PATCH bearbeitet weiterhin nur das fuehrende.
  await request.patch(`/api/projects/${projekt.id}`, { data: { autoSync: false } });
  const danach = (await (await request.get(`/api/projects/${projekt.id}`)).json()).project;
  expect(danach.repositories[0].autoSync).toBe(false);
  expect(danach.repositories[1].autoSync).toBe(true);

  // Fremde Konten kommen an kein Repository.
  const fremd = await playwright.request.newContext({
    baseURL: test.info().project.use.baseURL,
  });
  await login(fremd, ZWEITER);
  expect((await fremd.get(`/api/projects/${projekt.id}/repositories`)).status()).toBe(404);
  expect((await fremd.patch(`/api/repositories/${backendId}`, { data: {} })).status()).toBe(404);
  expect((await fremd.delete(`/api/repositories/${backendId}`)).status()).toBe(404);
  expect((await fremd.post(`/api/repositories/${backendId}/sync`)).status()).toBe(404);
  await fremd.dispose();

  // Entfernen laesst das andere stehen.
  expect((await request.delete(`/api/repositories/${backendId}`)).ok()).toBeTruthy();
  const zumSchluss = (await (await request.get(`/api/projects/${projekt.id}`)).json()).project;
  expect(zumSchluss.repositories).toHaveLength(1);
  expect(zumSchluss.repositories[0].repoName).toBe("swr");
});

test("Brett: Reihenfolge und Mehrfachauswahl", async ({ request, playwright }) => {
  await login(request, ADMIN);

  const angelegt = [];
  for (const name of ["Brett A", "Brett B", "Brett C"]) {
    const response = await request.post("/api/projects", { data: { name, status: "IDEA" } });
    angelegt.push((await response.json()).project);
  }
  // Neue Projekte haengen sich hinten an ihre Spalte an – fortlaufend, nicht
  // alle auf denselben Platz. Absolut zaehlen laesst sich nicht: in der
  // Spalte stehen schon Projekte aus frueheren Tests.
  const [a, b, c] = angelegt.map((p) => p.position);
  expect([b, c]).toEqual([a + 1, a + 2]);

  const ids = angelegt.map((p) => p.id);
  const vorher = angelegt[0].updatedAt;

  // Umdrehen und dabei eines in eine andere Spalte schieben.
  const gedreht = [ids[2], ids[1]];
  const reorder = await request.patch("/api/projects/reorder", {
    data: { columns: { IDEA: gedreht, IN_DEVELOPMENT: [ids[0]] } },
  });
  expect(reorder.ok()).toBeTruthy();

  const alle = (await (await request.get("/api/projects")).json()).projects;
  const finde = (id: string) => alle.find((p: { id: string }) => p.id === id);
  expect(finde(ids[2]).position).toBe(0);
  expect(finde(ids[1]).position).toBe(1);
  expect(finde(ids[0]).status).toBe("IN_DEVELOPMENT");

  // Reines Umsortieren darf das Aenderungsdatum nicht anfassen – sonst
  // schoebe ein Aufraeumen im Brett alles in "Zuletzt geaendert" nach oben.
  expect(new Date(finde(ids[1]).updatedAt).getTime()).toBe(
    new Date(angelegt[1].updatedAt).getTime(),
  );
  // Das verschobene dagegen hat sich wirklich geaendert.
  expect(new Date(finde(ids[0]).updatedAt).getTime()).toBeGreaterThan(
    new Date(vorher).getTime(),
  );

  // Mehrfachauswahl: Tags ergaenzen und wieder entfernen.
  const ergaenzt = await request.post("/api/projects/bulk", {
    data: { ids, action: "tags", tags: ["Sammel", "test"], tagMode: "add" },
  });
  expect((await ergaenzt.json()).changed).toBe(3);
  const mitTags = (await (await request.get("/api/projects")).json()).projects;
  // Kleingeschrieben abgelegt, wie ueberall.
  expect(mitTags.find((p: { id: string }) => p.id === ids[0]).tags).toContain("sammel");

  const entfernt = await request.post("/api/projects/bulk", {
    data: { ids, action: "tags", tags: ["sammel"], tagMode: "remove" },
  });
  expect((await entfernt.json()).changed).toBe(3);

  // Status fuer mehrere: die Verschobenen landen hintereinander, nicht
  // uebereinander auf derselben Position.
  const verschoben = await request.post("/api/projects/bulk", {
    data: { ids, action: "status", status: "PLANNING" },
  });
  expect((await verschoben.json()).changed).toBe(3);
  const geplant = (await (await request.get("/api/projects?status=PLANNING")).json()).projects;
  const positionen = geplant.map((p: { position: number }) => p.position).sort();
  expect(new Set(positionen).size).toBe(positionen.length);

  // Wer schon so steht, wird nicht noch einmal angefasst.
  const nochmal = await request.post("/api/projects/bulk", {
    data: { ids, action: "status", status: "PLANNING" },
  });
  expect((await nochmal.json()).changed).toBe(0);

  // Fremde IDs fallen still unter den Tisch, statt etwas anzurichten.
  const fremd = await playwright.request.newContext({
    baseURL: test.info().project.use.baseURL,
  });
  await login(fremd, ZWEITER);
  const untergeschoben = await fremd.post("/api/projects/bulk", {
    data: { ids, action: "delete" },
  });
  expect((await untergeschoben.json()).changed).toBe(0);
  const uebrig = (await (await request.get("/api/projects")).json()).projects;
  expect(uebrig.filter((p: { id: string }) => ids.includes(p.id))).toHaveLength(3);

  const fremdSortieren = await fremd.patch("/api/projects/reorder", {
    data: { columns: { DONE: ids } },
  });
  expect((await fremdSortieren.json()).updated).toBe(0);
  await fremd.dispose();

  // Und zum Schluss die eigenen wirklich loeschen.
  const geloescht = await request.post("/api/projects/bulk", {
    data: { ids, action: "delete" },
  });
  expect((await geloescht.json()).changed).toBe(3);
});

test("Projektvorlagen: aus Projekt sichern und anwenden", async ({ request, playwright }) => {
  await login(request, ADMIN);

  // Ein Projekt herrichten, das als Vorlage taugt.
  const quelle = (
    await (
      await request.post("/api/projects", {
        data: { name: "Vorlagenquelle", status: "PLANNING", priority: 3, tags: ["web", "docker"] },
      })
    ).json()
  ).project;

  await request.post(`/api/projects/${quelle.id}/notes`, {
    data: { content: "Checkliste vor dem Start." },
  });
  const erledigt = (
    await (
      await request.post(`/api/projects/${quelle.id}/tasks`, { data: { title: "Schon fertig" } })
    ).json()
  ).task;
  await request.patch(`/api/tasks/${erledigt.id}`, { data: { status: "DONE" } });
  await request.post(`/api/projects/${quelle.id}/tasks`, { data: { title: "Repo anlegen" } });
  await request.post(`/api/projects/${quelle.id}/tasks`, { data: { title: "CI einrichten" } });

  const gesichert = await request.post("/api/templates/from-project", {
    data: { projectId: quelle.id, name: "Web-App", description: "Mit Docker und CI" },
  });
  expect(gesichert.status()).toBe(201);
  const vorlage = (await gesichert.json()).template;

  expect(vorlage.tags).toEqual(["web", "docker"]);
  expect(vorlage.status).toBe("PLANNING");
  expect(vorlage.notes).toHaveLength(1);
  // Erledigte Aufgaben kommen nicht mit: eine Vorlage beschreibt, was zu tun ist.
  expect(vorlage.tasks).toHaveLength(2);
  expect(vorlage.tasks.map((task: { title: string }) => task.title)).not.toContain("Schon fertig");

  // Derselbe Name ein zweites Mal wird abgewiesen.
  const doppelt = await request.post("/api/templates/from-project", {
    data: { projectId: quelle.id, name: "Web-App" },
  });
  expect(doppelt.status()).toBe(409);

  // Anwenden: Notizen und Aufgaben entstehen mit dem Projekt.
  const neu = (
    await (
      await request.post("/api/projects", {
        data: { name: "Aus Vorlage", status: "IDEA", templateId: vorlage.id },
      })
    ).json()
  ).project;

  const geladen = (await (await request.get(`/api/projects/${neu.id}`)).json()).project;
  expect(geladen.notes).toHaveLength(1);
  expect(geladen.tasks).toHaveLength(2);
  // Die Reihenfolge der Vorlage bleibt erhalten.
  expect(geladen.tasks.map((task: { title: string }) => task.title)).toEqual([
    "Repo anlegen",
    "CI einrichten",
  ]);
  // Der ausdrueckliche Status gewinnt gegen den der Vorlage.
  expect(geladen.status).toBe("IDEA");

  // Der Verlauf haelt die Herkunft fest.
  const verlauf = (await (await request.get(`/api/projects/${neu.id}/activity`)).json()).activities;
  expect(verlauf.some((entry: { summary: string }) => entry.summary.includes("Web-App"))).toBe(true);

  // Eine fremde Vorlage laesst sich nicht unterschieben.
  const fremd = await playwright.request.newContext({
    baseURL: test.info().project.use.baseURL,
  });
  await login(fremd, ZWEITER);
  expect((await (await fremd.get("/api/templates")).json()).templates).toHaveLength(0);
  const untergeschoben = await fremd.post("/api/projects", {
    data: { name: "Klau", templateId: vorlage.id },
  });
  expect(untergeschoben.status()).toBe(404);
  expect((await fremd.delete(`/api/templates/${vorlage.id}`)).status()).toBe(404);
  await fremd.dispose();

  // Und die Vorlage ueberlebt das Loeschen ihres Ursprungsprojekts.
  await request.delete(`/api/projects/${quelle.id}`);
  const nochDa = (await (await request.get("/api/templates")).json()).templates;
  expect(nochDa).toHaveLength(1);

  expect((await request.delete(`/api/templates/${vorlage.id}`)).ok()).toBeTruthy();
});

test("Export enthaelt keine Geheimnisse, Import beachtet die Strategie", async ({ request }) => {
  await login(request, ADMIN);

  await request.post("/api/connections", {
    data: {
      name: "Mit Token",
      provider: "GITEA",
      baseUrl: "https://gitea.example.com",
      token: "streng-geheimes-token",
    },
  });

  const roh = await (await request.get("/api/projects/export")).text();
  expect(roh).not.toContain("streng-geheimes-token");
  expect(roh).not.toContain("tokenCipher");
  expect(roh).not.toContain("ownerId");

  const datei = JSON.parse(roh);
  const vorher = datei.projects.length;

  // Version 2: die Repositories stehen als Liste in der Datei.
  expect(datei.version).toBe(2);
  const mitRepo = datei.projects.find((entry: { name: string }) => entry.name === "Zwei Teile");
  expect(mitRepo.repositories).toHaveLength(1);
  expect(mitRepo.repositories[0].repoName).toBe("swr");

  // Ueberspringen aendert nichts.
  const uebersprungen = await request.post("/api/projects/import", {
    data: { data: datei, strategy: "skip", dryRun: false },
  });
  expect((await uebersprungen.json()).summary.skipped).toBe(vorher);

  // Zusaetzlich anlegen verdoppelt.
  const zusaetzlich = await request.post("/api/projects/import", {
    data: { data: datei, strategy: "rename", dryRun: false },
  });
  expect((await zusaetzlich.json()).summary.renamed).toBe(vorher);

  const jetzt = (await (await request.get("/api/projects")).json()).projects;
  expect(jetzt).toHaveLength(vorher * 2);

  // Muell wird abgewiesen.
  const muell = await request.post("/api/projects/import", {
    data: { data: { irgendwas: true }, strategy: "skip", dryRun: true },
  });
  expect(muell.status()).toBe(422);
});

test("Dateien der Version 1 bleiben lesbar", async ({ request }) => {
  await login(request, ADMIN);

  // Damals stand genau ein Repository flach am Projekt. Wer eine solche
  // Sicherung liegen hat, soll sie weiterhin einspielen koennen.
  const alt = {
    kind: "nebula.projects",
    version: 1,
    projects: [
      {
        name: "Aus Version eins",
        repoUrl: "https://github.com/vercel/swr",
        repoOwner: "vercel",
        repoName: "swr",
        autoSync: false,
      },
    ],
  };

  const gelesen = await request.post("/api/projects/import", {
    data: { data: alt, strategy: "rename", dryRun: false },
  });
  expect(gelesen.ok()).toBeTruthy();

  const projekte = (await (await request.get("/api/projects")).json()).projects;
  const uebernommen = projekte.find(
    (entry: { name: string }) => entry.name === "Aus Version eins",
  );
  expect(uebernommen.repositories).toHaveLength(1);
  expect(uebernommen.repositories[0].repoOwner).toBe("vercel");
  expect(uebernommen.repositories[0].autoSync).toBe(false);
});
