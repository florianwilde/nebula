import { describe, expect, it } from "vitest";
import { NOTIFICATION_EVENTS } from "@/lib/notify/types";
import { notificationTargetCreateSchema } from "./validation";

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
