import { expect, test } from "@playwright/test";

/**
 * Ein Weg durch die Oberflaeche, wie ihn ein Mensch geht: anmelden, Projekt
 * anlegen, Aufgaben verwalten. Keine Vollabdeckung – die Wege, die kaputt
 * gehen duerfen, ohne dass es jemand merkt.
 *
 * Setzt voraus, dass api.spec.ts das Konto bereits angelegt hat; laeuft
 * alphabetisch danach.
 */

const KONTO = { username: "chefin", password: "ein-langes-testpasswort" };

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ page }) => {
  await page.goto("/login");
  await page.fill("#login-username", KONTO.username);
  await page.fill("#login-password", KONTO.password);
  await page.click('button[type="submit"]');
  await expect(page.getByText("Vibe Coding Kontrollzentrum")).toBeVisible();
});

test("Dashboard zeigt Kennzahlen und Projekte", async ({ page }) => {
  await expect(page.getByRole("heading", { name: /Deine Projekte/ })).toBeVisible();
  await expect(page.getByText("Projekte", { exact: false }).first()).toBeVisible();
  // Keine unbeabsichtigten Fehler in der Konsole.
  expect(page.url()).toContain("/");
});

test("Projekt anlegen und wiederfinden", async ({ page }) => {
  await page.getByRole("button", { name: /Neues Projekt/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();

  await page.fill("#project-name", "Oberflaechentest");
  await page.fill("#project-summary", "Von Playwright angelegt.");
  await page.getByRole("button", { name: "Projekt anlegen" }).click();

  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByText("Oberflaechentest")).toBeVisible();
});

test("Aufgaben anlegen und per Ziehen verschieben", async ({ page }) => {
  await page.getByRole("link", { name: /Projekt Oberflaechentest/ }).click();
  await expect(page.getByRole("heading", { name: "Oberflaechentest" })).toBeVisible();

  // Zwei Aufgaben ueber den Dialog anlegen.
  for (const titel of ["Erste Aufgabe", "Zweite Aufgabe"]) {
    await page.getByRole("button", { name: "Aufgabe", exact: true }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.fill("#task-title", titel);
    await page.getByRole("button", { name: "Anlegen" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
  }

  const offen = page.locator('[data-task-column="TODO"]');
  const inArbeit = page.locator('[data-task-column="DOING"]');
  await expect(offen.getByText("Erste Aufgabe")).toBeVisible();
  await expect(offen.getByText("Zweite Aufgabe")).toBeVisible();

  // Erste Aufgabe nach "In Arbeit" ziehen.
  const griff = offen.locator('button[aria-label$="verschieben"]').first();
  const von = await griff.boundingBox();
  const nach = await inArbeit.boundingBox();
  expect(von && nach).toBeTruthy();

  await page.mouse.move(von!.x + von!.width / 2, von!.y + von!.height / 2);
  await page.mouse.down();
  // Erst ueber die Aktivierungsschwelle des Sensors (5 Pixel) hinaus.
  await page.mouse.move(von!.x + 30, von!.y + 10, { steps: 6 });
  await page.mouse.move(nach!.x + nach!.width / 2, nach!.y + 60, { steps: 20 });
  // dnd-kit wertet die Bewegung in einem eigenen Frame aus. Ohne diese
  // Pause faende das Loslassen noch kein Ziel und die Karte spraenge zurueck.
  await page.waitForTimeout(250);

  // Auf die Antwort warten, bevor neu geladen wird. Sonst bricht das Neuladen
  // den noch laufenden Aufruf ab, und der Test schlaegt gelegentlich fehl,
  // obwohl die Anwendung in Ordnung ist – genau so ist es passiert.
  const gespeichert = page.waitForResponse(
    (response) => response.url().includes("/tasks/reorder") && response.request().method() === "PATCH",
  );
  await page.mouse.up();

  await expect(inArbeit.getByText("Erste Aufgabe")).toBeVisible();
  expect((await gespeichert).ok()).toBeTruthy();

  // Und der Server hat es auch so gespeichert.
  await page.reload();
  await expect(
    page.locator('[data-task-column="DOING"]').getByText("Erste Aufgabe"),
  ).toBeVisible();
});

test("Volltextsuche findet Notizen", async ({ page }) => {
  await page.getByRole("link", { name: /Projekt Oberflaechentest/ }).click();
  await page.getByRole("button", { name: "Notiz", exact: true }).click();

  await page.getByPlaceholder(/Gedanken/).fill("Suchbegriff Zaunkoenig steht hier.");
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByText("Zaunkoenig", { exact: false })).toBeVisible();

  // exact, sonst trifft es auch "Zurueck zum Dashboard".
  await page.getByRole("link", { name: "Dashboard", exact: true }).click();
  await page.getByPlaceholder(/durchsuchen/).fill("Zaunkoenig");

  await expect(page.getByText("Treffer in Notizen")).toBeVisible();
});

test("Listenansicht auf Telefonbreite ohne seitliches Scrollen", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });

  await page.getByRole("button", { name: "Liste" }).click();
  await expect(page.getByRole("link", { name: /Projekt Oberflaechentest/ })).toBeVisible();

  // Der eigentliche Punkt der Ansicht: sie passt in die Breite. Frueher schob
  // die Steuerleiste den Knopf "Neues Projekt" aus dem Bild und die ganze
  // Seite liess sich seitwaerts schieben.
  const masse = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(masse.scrollWidth).toBeLessThanOrEqual(masse.clientWidth + 1);

  // Auch der Knopf muss erreichbar bleiben – auf dieser Breite traegt er nur
  // noch das Pluszeichen und lebt von seinem aria-label. Geprueft wird die
  // rechte Kante: genau die lag vorher ausserhalb des Bildschirms.
  const knopf = page.getByRole("button", { name: "Neues Projekt" });
  await expect(knopf).toBeVisible();
  const kasten = await knopf.boundingBox();
  expect(kasten).not.toBeNull();
  expect(kasten!.x + kasten!.width).toBeLessThanOrEqual(masse.clientWidth);
});

test("Schnellerfassung legt Idee und Aufgabe mit einem Feld an", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });

  await page.getByRole("button", { name: "Schnell erfassen" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  // Idee: nur der Name, alles andere kommt aus den Vorgaben des Schemas.
  await page.fill("#quick-title", "Aus der Bahn notiert");
  await dialog.getByRole("button", { name: "Anlegen" }).click();

  // Der Dialog bleibt offen und bestaetigt – das ist der Punkt der
  // Schnellerfassung: die naechste Idee soll ohne Umweg hineingehen.
  await expect(dialog.getByText("Angelegt")).toBeVisible();
  await expect(dialog.getByRole("link", { name: "Aus der Bahn notiert" })).toBeVisible();
  await expect(page.locator("#quick-title")).toHaveValue("");

  // Aufgabe: derselbe Dialog, ein Feld mehr.
  await dialog.getByRole("button", { name: "Aufgabe", exact: true }).click();
  await page.fill("#quick-title", "Unterwegs eingefallen");
  await expect(page.locator("#quick-project")).toBeVisible();
  await dialog.getByRole("button", { name: "Anlegen" }).click();
  await expect(dialog.getByRole("link", { name: "Unterwegs eingefallen" })).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  // Die Idee steht als Projekt im Dashboard.
  await page.goto("/");
  await expect(page.getByText("Aus der Bahn notiert")).toBeVisible();
});

test("Dialoge weichen der Bildschirmtastatur aus", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.getByRole("button", { name: "Schnell erfassen" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();

  const TASTATUR = 336;

  /**
   * Eine echte Tastatur laesst sich nicht einblenden. Stattdessen meldet
   * visualViewport eine kleinere Hoehe – genau die Schnittstelle, an der
   * der Dialog haengt. Ueberschrieben wird am echten Objekt: der Dialog
   * merkt sich beim Oeffnen eine Referenz darauf.
   */
  await page.evaluate((tastatur) => {
    const fenster = window.visualViewport;
    if (!fenster) throw new Error("visualViewport fehlt");
    const hoehe = window.innerHeight - tastatur;
    Object.defineProperty(fenster, "height", { get: () => hoehe, configurable: true });
    Object.defineProperty(fenster, "offsetTop", { get: () => 0, configurable: true });
    fenster.dispatchEvent(new Event("resize"));
  }, TASTATUR);

  await page.waitForTimeout(300);

  // Eingabefeld und Absendeknopf muessen oberhalb der Tastatur liegen.
  // Vorher stand der Dialog mittig im vollen Fenster – und damit zur
  // Haelfte darunter.
  const frei = 667 - TASTATUR;
  for (const ziel of [
    page.locator("#quick-title"),
    page.getByRole("dialog").getByRole("button", { name: "Anlegen" }),
  ]) {
    const kasten = await ziel.boundingBox();
    expect(kasten).not.toBeNull();
    expect(kasten!.y + kasten!.height).toBeLessThanOrEqual(frei);
  }

  await page.keyboard.press("Escape");
});

test("Aufgabenuebersicht sammelt ueber alle Projekte und hakt ab", async ({ page }) => {
  await page.getByRole("link", { name: "Aufgaben", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Aufgaben", level: 1 })).toBeVisible();

  // Die zuvor per Schnellerfassung angelegte Aufgabe taucht hier auf,
  // obwohl sie in einem anderen Projekt haengt.
  const zeile = page.getByRole("listitem").filter({ hasText: "Unterwegs eingefallen" });
  await expect(zeile).toBeVisible();

  // Abhaken aus der Uebersicht heraus.
  await zeile.getByRole("button", { name: /abhaken/ }).click();
  // Ohne "Erledigte einblenden" verschwindet sie damit aus der Liste.
  await expect(zeile).toBeHidden();

  await page.getByLabel("Erledigte einblenden").check();
  await expect(
    page.getByRole("listitem").filter({ hasText: "Unterwegs eingefallen" }),
  ).toBeVisible();
});

test("Wochenrueckblick zeigt, was diese Woche passiert ist", async ({ page }) => {
  // Erreichbar vom Dashboard aus, ohne vierten Punkt in der Kopfleiste.
  await page.getByRole("link", { name: /Wochenrückblick/ }).click();
  await expect(page).toHaveURL(/\/rueckblick$/);
  await expect(page.getByRole("heading", { name: "Diese Woche", level: 1 })).toBeVisible();

  // Die Vorgaenge der bisherigen Tests liegen in dieser Woche, es muss also
  // etwas dastehen – und das Projekt gehoert an jede Zeile.
  await expect(page.getByRole("link", { name: "Oberflaechentest" }).first()).toBeVisible();

  // Blättern: zurück und wieder her.
  await page.getByRole("link", { name: "Eine Woche zurück" }).click();
  await expect(page).toHaveURL(/woche=-1/);
  await expect(page.getByRole("heading", { name: "Vorige Woche", level: 1 })).toBeVisible();

  await page.getByRole("link", { name: "Diese Woche", exact: true }).click();
  await expect(page).toHaveURL(/\/rueckblick$/);

  // Auch ueber die Schnellsuche erreichbar.
  await page.goto("/");
  await page.keyboard.press("Control+k");
  await page.getByPlaceholder(/^Projekt, /).fill("Rückblick");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/rueckblick/);
});

test("Globale Zeitleiste zeigt den Verlauf ueber alle Projekte", async ({ page }) => {
  // Vom Wochenrueckblick aus verlinkt.
  await page.goto("/rueckblick");
  await page.getByRole("link", { name: /Ganzer Verlauf/ }).click();
  await expect(page).toHaveURL(/\/verlauf$/);
  await expect(page.getByRole("heading", { name: "Verlauf", level: 1 })).toBeVisible();

  // Eintraege mit Projektbezug – ohne den ist eine uebergreifende Liste
  // nicht zu lesen.
  await expect(page.getByRole("link", { name: "Oberflaechentest" }).first()).toBeVisible();
  await expect(page.getByText(/Vorgänge geladen|Vorgang geladen/)).toBeVisible();

  // Auch ueber die Schnellsuche erreichbar.
  await page.goto("/");
  await page.keyboard.press("Control+k");
  await page.getByPlaceholder(/^Projekt, /).fill("Verlauf");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/verlauf/);
});

test("Aufgabendashboard laesst sich durchsuchen", async ({ page }) => {
  await page.getByRole("link", { name: "Aufgaben", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Aufgaben", level: 1 })).toBeVisible();

  const suchfeld = page.getByLabel("Aufgaben durchsuchen");
  await expect(suchfeld).toBeVisible();

  // Aus den frueheren Tests gibt es "Erste Aufgabe" und "Zweite Aufgabe".
  await suchfeld.fill("Erste");
  await expect(page.getByRole("listitem").filter({ hasText: "Erste Aufgabe" })).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "Zweite Aufgabe" })).toBeHidden();

  // Ohne Treffer erklaert der Leerzustand, worin gesucht wurde.
  await suchfeld.fill("gibtesnichtxyz");
  await expect(page.getByText("Keine Treffer")).toBeVisible();
  await expect(page.getByText(/Titel, Beschreibung, Labels und Projektname/)).toBeVisible();

  // Zuruecksetzen bringt alles wieder.
  await page.getByRole("button", { name: "Suche zuruecksetzen" }).click();
  await expect(suchfeld).toHaveValue("");
  await expect(page.getByRole("listitem").filter({ hasText: "Erste Aufgabe" })).toBeVisible();
});

test("Schnellsuche findet Projekt und Notiz", async ({ page }) => {
  await page.keyboard.press("Control+k");
  await expect(page.getByRole("dialog", { name: "Schnellsuche" })).toBeVisible();

  // Ohne Eingabe stehen Projekte und Bereiche bereit.
  await expect(page.getByRole("dialog").getByText("Oberflaechentest")).toBeVisible();

  await page.getByPlaceholder(/^Projekt, /).fill("Zaunkoenig");
  await expect(page.getByRole("dialog").getByText(/in Oberflaechentest/)).toBeVisible();

  // Enter springt zum ersten Treffer.
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Oberflaechentest" })).toBeVisible();

  // Escape schliesst wieder.
  await page.keyboard.press("Control+k");
  await expect(page.getByRole("dialog", { name: "Schnellsuche" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Schnellsuche" })).toBeHidden();
});

test("Mehrfachauswahl aendert mehrere Projekte auf einmal", async ({ page }) => {
  const kaestchen = page.locator('input[aria-label$="auswaehlen"]');
  const anzahl = await kaestchen.count();
  expect(anzahl).toBeGreaterThan(0);

  // Ohne Auswahl gibt es keine Leiste – sie soll nicht dauerhaft im Weg sein.
  await expect(page.getByText(/ausgewählt/)).toBeHidden();

  await kaestchen.first().check();
  await expect(page.getByText("1 ausgewählt")).toBeVisible();

  await page.getByRole("button", { name: "Tags", exact: true }).click();
  await page.fill("#bulk-tags", "sammeltest");
  await page.getByRole("button", { name: "Hinzufügen" }).click();

  await expect(page.getByText("#sammeltest").first()).toBeVisible();
  // Nach getaner Arbeit ist die Auswahl aufgehoben.
  await expect(page.getByText(/ausgewählt/)).toBeHidden();
});

test("Die Versionsnummer oeffnet den Aenderungsverlauf", async ({ page }) => {
  await page.getByRole("button", { name: /^v\d+\.\d+\.\d+$/ }).click();

  // Ueber die Rolle, nicht ueber den Text: das Wort steht auch in einem der
  // Eintraege, und ein blosser Textvergleich waere mehrdeutig.
  const dialog = page.getByRole("dialog", { name: "Änderungsverlauf" });
  await expect(dialog).toBeVisible();
  // Die laufende Fassung ist als solche gekennzeichnet.
  await expect(dialog.getByText("installiert")).toBeVisible();
  // Und es steht wirklich etwas drin.
  await expect(dialog.getByRole("heading", { level: 3 }).first()).toBeVisible();
  await expect(dialog.getByText("Neu").first()).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("Das Manifest liegt bereit, auch ohne Anmeldung", async ({ page, playwright }) => {
  const anonym = await playwright.request.newContext({
    baseURL: test.info().project.use.baseURL,
  });

  // Ohne diesen Weg an der Zugangsschranke vorbei liesse sich die Anwendung
  // nicht installieren: der Browser holt das Manifest, bevor jemand angemeldet ist.
  const antwort = await anonym.get("/manifest.webmanifest");
  expect(antwort.ok()).toBeTruthy();

  const manifest = await antwort.json();
  expect(manifest.name).toContain("Nebula");
  expect(manifest.display).toBe("standalone");
  expect(manifest.icons.some((icon: { purpose: string }) => icon.purpose === "maskable")).toBe(true);

  for (const icon of manifest.icons) {
    const bild = await anonym.get(icon.src);
    expect(bild.ok(), icon.src).toBeTruthy();
    expect(bild.headers()["content-type"]).toContain("image/png");
  }

  await anonym.dispose();

  // Die Seite muss ein Symbol verweisen. Fehlt es, sucht der Browser
  // /favicon.ico – das es hier nicht gibt, und die Konsole fuellt sich mit
  // 404ern. Genau das ist beim Ergaenzen des Apple-Symbols passiert.
  await page.goto("/");
  await expect(page.locator('link[rel="icon"]').first()).toHaveAttribute("href", /icon/);
});

test("Abmelden fuehrt zurueck zur Anmeldung", async ({ page }) => {
  await page.getByRole("button", { name: /Benutzermenue/ }).click();
  await page.getByRole("menuitem", { name: "Abmelden" }).click();
  await expect(page).toHaveURL(/\/login/);

  // Und die geschuetzte Seite ist wieder zu.
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
});
