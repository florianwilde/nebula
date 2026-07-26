import { describe, expect, it } from "vitest";
import { NOTIFICATION_EVENTS } from "@/lib/notify/types";
import {
  notificationTargetCreateSchema,
  projectBulkSchema,
  projectReorderSchema,
} from "./validation";

/**
 * Dieser Test entstand aus einem Fehler: beim Ergaenzen eines neuen
 * Anlasses war das Zod-Schema nicht mitgezogen worden, die API lehnte ihn
 * mit 422 ab. Die Liste steht an zwei Stellen – hier wird geprueft, dass
 * sie zusammenpassen.
 */

const basis = {
  name: "Handy",
  channel: "NTFY" as const,
  target: "https://ntfy.sh/mein-thema",
};

describe("notificationTargetCreateSchema", () => {
  it("kennt jeden Anlass, den die Oberflaeche anbietet", () => {
    for (const event of NOTIFICATION_EVENTS) {
      const ergebnis = notificationTargetCreateSchema.safeParse({
        ...basis,
        events: [event],
      });
      expect(ergebnis.success, `Anlass ${event} wird abgelehnt`).toBe(true);
    }
  });

  it("verlangt mindestens einen Anlass", () => {
    expect(notificationTargetCreateSchema.safeParse({ ...basis, events: [] }).success).toBe(
      false,
    );
  });

  it("weist unbekannte Anlaesse ab", () => {
    expect(
      notificationTargetCreateSchema.safeParse({ ...basis, events: ["WAS_AUCH_IMMER"] })
        .success,
    ).toBe(false);
  });

  it("verlangt bei E-Mail eine Adresse, keine URL", () => {
    const alsUrl = notificationTargetCreateSchema.safeParse({
      name: "Post",
      channel: "EMAIL",
      target: "https://example.com",
      events: ["SYNC_FAILED"],
    });
    expect(alsUrl.success).toBe(false);

    const alsAdresse = notificationTargetCreateSchema.safeParse({
      name: "Post",
      channel: "EMAIL",
      target: "ich@example.com",
      events: ["SYNC_FAILED"],
    });
    expect(alsAdresse.success).toBe(true);
  });

  it("verlangt bei Webhook und ntfy eine http-URL", () => {
    for (const channel of ["WEBHOOK", "NTFY"] as const) {
      expect(
        notificationTargetCreateSchema.safeParse({
          name: "X",
          channel,
          target: "ich@example.com",
          events: ["SYNC_FAILED"],
        }).success,
      ).toBe(false);
    }
  });
});

describe("projectReorderSchema", () => {
  it("nimmt Spalten mit Listen an", () => {
    const parsed = projectReorderSchema.safeParse({
      columns: { IDEA: ["a", "b"], DONE: [] },
    });
    expect(parsed.success).toBe(true);
  });

  it("weist unbekannte Spalten ab", () => {
    expect(
      projectReorderSchema.safeParse({ columns: { PHANTASIE: ["a"] } }).success,
    ).toBe(false);
  });

  it("weist einen leeren Aufruf ab, statt ihn wirkungslos durchzuwinken", () => {
    expect(projectReorderSchema.safeParse({ columns: {} }).success).toBe(false);
  });
});

describe("projectBulkSchema", () => {
  const ids = ["a", "b"];

  it("verlangt zu jeder Aktion die noetige Angabe", () => {
    // Ohne diese Pruefungen kaeme die Aktion durch und taete nichts – der
    // schlimmste Fall, weil niemand merkt, dass nichts passiert ist.
    expect(projectBulkSchema.safeParse({ ids, action: "status" }).success).toBe(false);
    expect(projectBulkSchema.safeParse({ ids, action: "tags" }).success).toBe(false);
    expect(projectBulkSchema.safeParse({ ids, action: "tags", tags: [] }).success).toBe(false);
    expect(projectBulkSchema.safeParse({ ids, action: "favorite" }).success).toBe(false);
  });

  it("laesst vollstaendige Aktionen durch", () => {
    expect(
      projectBulkSchema.safeParse({ ids, action: "status", status: "DONE" }).success,
    ).toBe(true);
    expect(
      projectBulkSchema.safeParse({ ids, action: "tags", tags: ["archiv"] }).success,
    ).toBe(true);
    expect(
      projectBulkSchema.safeParse({ ids, action: "favorite", favorite: false }).success,
    ).toBe(true);
    // Loeschen braucht nichts ausser den IDs.
    expect(projectBulkSchema.safeParse({ ids, action: "delete" }).success).toBe(true);
  });

  it("ergaenzt standardmaessig, statt zu entfernen", () => {
    const parsed = projectBulkSchema.parse({ ids, action: "tags", tags: ["x"] });
    expect(parsed.tagMode).toBe("add");
  });

  it("braucht mindestens eine ID und deckelt die Menge", () => {
    expect(projectBulkSchema.safeParse({ ids: [], action: "delete" }).success).toBe(false);
    const zuViele = Array.from({ length: 201 }, (_, index) => `id-${index}`);
    expect(projectBulkSchema.safeParse({ ids: zuViele, action: "delete" }).success).toBe(false);
  });
});
