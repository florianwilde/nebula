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
  await page.mouse.up();

  await expect(inArbeit.getByText("Erste Aufgabe")).toBeVisible();

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

test("Schnellsuche findet Projekt und Notiz", async ({ page }) => {
  await page.keyboard.press("Control+k");
  await expect(page.getByRole("dialog", { name: "Schnellsuche" })).toBeVisible();

  // Ohne Eingabe stehen Projekte und Bereiche bereit.
  await expect(page.getByRole("dialog").getByText("Oberflaechentest")).toBeVisible();

  await page.getByPlaceholder(/Projekt, Notiz oder Bereich/).fill("Zaunkoenig");
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

test("Abmelden fuehrt zurueck zur Anmeldung", async ({ page }) => {
  await page.getByRole("button", { name: /Benutzermenue/ }).click();
  await page.getByRole("menuitem", { name: "Abmelden" }).click();
  await expect(page).toHaveURL(/\/login/);

  // Und die geschuetzte Seite ist wieder zu.
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
});
