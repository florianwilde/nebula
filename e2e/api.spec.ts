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
