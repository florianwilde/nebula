import { z } from "zod";

const STATUS = ["IDEA", "OPEN", "PLANNING", "IN_DEVELOPMENT", "DONE", "ARCHIVED"] as const;
const PROVIDERS = ["GITHUB", "GITLAB", "GITEA"] as const;
const ACCENTS = ["violet", "cyan", "emerald", "amber", "rose", "blue"] as const;

const emptyToNull = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? null : value;

export const projectCreateSchema = z.object({
  name: z.string().trim().min(1, "Name darf nicht leer sein").max(120),
  summary: z.preprocess(emptyToNull, z.string().trim().max(280).nullable().optional()),
  description: z.preprocess(emptyToNull, z.string().trim().max(20000).nullable().optional()),
  status: z.enum(STATUS).default("IDEA"),
  priority: z.coerce.number().int().min(1).max(4).default(2),
  progress: z.coerce.number().int().min(0).max(100).default(0),
  accent: z.enum(ACCENTS).default("violet"),
  tags: z.array(z.string().trim().min(1).max(30)).max(12).default([]),
  favorite: z.boolean().default(false),
  /**
   * Die Git-Felder liegen seit dem Umbau am Repository, bleiben hier aber
   * stehen: sie setzen das fuehrende Repository und legen es notfalls an.
   * So kommt man mit einem Aufruf zu Projekt und Repo, und bestehende
   * Aufrufer – auch der Import – muessen nichts wissen.
   */
  repoUrl: z.preprocess(emptyToNull, z.string().trim().max(500).nullable().optional()),
  repoOwner: z.preprocess(emptyToNull, z.string().trim().max(200).nullable().optional()),
  repoName: z.preprocess(emptyToNull, z.string().trim().max(200).nullable().optional()),
  connectionId: z.preprocess(emptyToNull, z.string().trim().nullable().optional()),
  /** Am automatischen Abgleich teilnehmen. */
  autoSync: z.boolean().default(true),
  /** Fortschritt aus dem Verhaeltnis erledigter Aufgaben berechnen. */
  progressFromTasks: z.boolean().default(false),
});

export const projectUpdateSchema = projectCreateSchema.partial();

/**
 * Neue Reihenfolge im Brett. Uebergeben wird je betroffener Spalte die
 * vollstaendige Liste in ihrer neuen Reihenfolge – daraus ergeben sich Status
 * und Position eindeutig, und der Aufruf laesst sich gefahrlos wiederholen.
 */
export const projectReorderSchema = z.object({
  columns: z
    .record(z.enum(STATUS), z.array(z.string().min(1)).max(500))
    .refine((value) => Object.keys(value).length > 0, "Keine Spalte angegeben"),
});

/** Dieselbe Aenderung fuer mehrere Projekte auf einmal. */
export const projectBulkSchema = z
  .object({
    ids: z.array(z.string().min(1)).min(1).max(200),
    action: z.enum(["status", "tags", "favorite", "delete"]),
    status: z.enum(STATUS).optional(),
    /** Bei action "tags": ergaenzen oder entfernen. */
    tags: z.array(z.string().trim().min(1).max(30)).max(12).optional(),
    tagMode: z.enum(["add", "remove"]).default("add"),
    favorite: z.boolean().optional(),
  })
  .refine((value) => value.action !== "status" || value.status !== undefined, {
    message: "Ohne Zielstatus laesst sich nichts verschieben",
    path: ["status"],
  })
  .refine((value) => value.action !== "tags" || (value.tags?.length ?? 0) > 0, {
    message: "Ohne Tags gibt es nichts zu aendern",
    path: ["tags"],
  })
  .refine((value) => value.action !== "favorite" || value.favorite !== undefined, {
    message: "Kein Zielzustand angegeben",
    path: ["favorite"],
  });

// ── Repositories ─────────────────────────────────────────────

export const repositoryCreateSchema = z.object({
  label: z.preprocess(emptyToNull, z.string().trim().max(80).nullable().optional()),
  repoUrl: z.preprocess(emptyToNull, z.string().trim().max(500).nullable().optional()),
  repoOwner: z.preprocess(emptyToNull, z.string().trim().max(200).nullable().optional()),
  repoName: z.preprocess(emptyToNull, z.string().trim().max(200).nullable().optional()),
  connectionId: z.preprocess(emptyToNull, z.string().trim().nullable().optional()),
  autoSync: z.boolean().default(true),
});

export const repositoryUpdateSchema = repositoryCreateSchema.partial().extend({
  /** Zum Umsortieren; 0 ist das fuehrende. */
  position: z.coerce.number().int().min(0).max(50).optional(),
});

// ── Aufgaben ─────────────────────────────────────────────────

const TASK_STATUS = ["TODO", "DOING", "BLOCKED", "DONE"] as const;

const dueDateField = z.preprocess(
  emptyToNull,
  z
    .string()
    .trim()
    .refine((value) => !Number.isNaN(Date.parse(value)), "Kein gueltiges Datum")
    .nullable()
    .optional(),
);

export const taskCreateSchema = z.object({
  title: z.string().trim().min(1, "Titel darf nicht leer sein").max(200),
  description: z.preprocess(emptyToNull, z.string().trim().max(5000).nullable().optional()),
  status: z.enum(TASK_STATUS).default("TODO"),
  dueDate: dueDateField,
  labels: z.array(z.string().trim().min(1).max(30)).max(8).default([]),
});

export const taskUpdateSchema = taskCreateSchema.partial();

/**
 * Neue Reihenfolge nach dem Ziehen. Uebergeben wird je betroffener Spalte
 * die vollstaendige Liste der Aufgaben in ihrer neuen Reihenfolge – daraus
 * ergeben sich Status und Position eindeutig.
 */
export const taskReorderSchema = z.object({
  columns: z
    .record(z.enum(TASK_STATUS), z.array(z.string().min(1)).max(500))
    .refine((value) => Object.keys(value).length > 0, "Keine Spalte angegeben"),
});

export const noteCreateSchema = z.object({
  title: z.preprocess(emptyToNull, z.string().trim().max(160).nullable().optional()),
  content: z.string().trim().min(1, "Notiz darf nicht leer sein").max(20000),
  pinned: z.boolean().default(false),
});

export const noteUpdateSchema = noteCreateSchema.partial();

export const connectionCreateSchema = z.object({
  name: z.string().trim().min(1, "Name darf nicht leer sein").max(80),
  provider: z.enum(PROVIDERS),
  baseUrl: z
    .string()
    .trim()
    .min(1, "Basis-URL fehlt")
    .max(300)
    .refine((value) => /^https?:\/\//i.test(value), "URL muss mit http:// oder https:// beginnen"),
  username: z.preprocess(emptyToNull, z.string().trim().max(120).nullable().optional()),
  token: z.preprocess(emptyToNull, z.string().trim().max(500).nullable().optional()),
});

export const connectionUpdateSchema = connectionCreateSchema.partial();

// ── Benutzer, Anmeldung, Verwaltung ──────────────────────────

/** Benutzernamen werden immer kleingeschrieben gespeichert und verglichen. */
export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "Mindestens 3 Zeichen")
  .max(32, "Hoechstens 32 Zeichen")
  .regex(
    /^[a-z0-9][a-z0-9._-]*$/,
    "Erlaubt sind Kleinbuchstaben, Ziffern, Punkt, Bindestrich und Unterstrich",
  );

const passwordField = z.string().min(1, "Passwort fehlt").max(200);
const emailField = z.preprocess(
  emptyToNull,
  z.string().trim().toLowerCase().email("Keine gueltige E-Mail-Adresse").nullable().optional(),
);
const displayNameField = z.preprocess(
  emptyToNull,
  z.string().trim().max(80).nullable().optional(),
);

export const setupSchema = z.object({
  username: usernameSchema,
  displayName: displayNameField,
  email: emailField,
  password: passwordField,
  /** Betriebsart, die beim Einrichten gewaehlt wurde. */
  mode: z.enum(["SINGLE_USER", "MULTI_USER"]).default("SINGLE_USER"),
});

export const loginSchema = z.object({
  username: z.string().trim().toLowerCase().min(1, "Benutzername fehlt").max(64),
  password: passwordField,
});

export const registerSchema = z.object({
  username: usernameSchema,
  displayName: displayNameField,
  email: emailField,
  password: passwordField,
});

export const changePasswordSchema = z.object({
  /** Entfaellt bei Konten, die bisher nur einen Passkey haben. */
  currentPassword: z.preprocess(emptyToNull, z.string().max(200).nullable().optional()),
  newPassword: passwordField,
});

export const profileUpdateSchema = z.object({
  displayName: displayNameField,
  email: emailField,
});

export const adminSettingsSchema = z.object({
  mode: z.enum(["SINGLE_USER", "MULTI_USER"]).optional(),
  allowRegistration: z.boolean().optional(),
  /** Ab wie vielen Tagen ohne Commit ein Projekt als stillstehend gilt. */
  staleAfterDays: z.coerce.number().int().min(7).max(365).optional(),
  autoSyncEnabled: z.boolean().optional(),
  /** Untergrenze 5 Minuten – haeufiger waere den Git-APIs gegenueber unfair. */
  autoSyncIntervalMinutes: z.coerce.number().int().min(5).max(10080).optional(),
  autoSyncActiveOnly: z.boolean().optional(),
  autoSyncBatchSize: z.coerce.number().int().min(1).max(200).optional(),
});

export const adminUserCreateSchema = z.object({
  username: usernameSchema,
  displayName: displayNameField,
  email: emailField,
  password: passwordField,
  role: z.enum(["ADMIN", "USER"]).default("USER"),
});

export const adminUserUpdateSchema = z.object({
  displayName: displayNameField,
  email: emailField,
  role: z.enum(["ADMIN", "USER"]).optional(),
  isActive: z.boolean().optional(),
  /** Neues Passwort setzen; leer lassen heisst unveraendert. */
  password: z.preprocess(emptyToNull, z.string().max(200).nullable().optional()),
});

// ── Benachrichtigungen ───────────────────────────────────────

const CHANNELS = ["WEBHOOK", "NTFY", "EMAIL"] as const;
const EVENTS = ["SYNC_FAILED", "CI_FAILED", "NEW_RELEASE", "PROJECT_STALE"] as const;

export const notificationTargetCreateSchema = z
  .object({
    name: z.string().trim().min(1, "Name darf nicht leer sein").max(60),
    channel: z.enum(CHANNELS),
    target: z.string().trim().min(1, "Ziel fehlt").max(500),
    /** Bearer-Token fuer ntfy oder Signaturschluessel fuer den Webhook. */
    secret: z.preprocess(emptyToNull, z.string().trim().max(300).nullable().optional()),
    events: z.array(z.enum(EVENTS)).min(1, "Mindestens ein Anlass"),
    isActive: z.boolean().default(true),
  })
  .refine(
    (value) =>
      value.channel === "EMAIL"
        ? /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value.target)
        : /^https?:\/\//i.test(value.target),
    {
      message: "E-Mail-Adresse bzw. URL mit http:// oder https:// erwartet",
      path: ["target"],
    },
  );

export const notificationTargetUpdateSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  target: z.string().trim().min(1).max(500).optional(),
  secret: z.preprocess(emptyToNull, z.string().trim().max(300).nullable().optional()),
  events: z.array(z.enum(EVENTS)).min(1).optional(),
  isActive: z.boolean().optional(),
});

export const passkeyNameSchema = z.object({
  name: z.preprocess(emptyToNull, z.string().trim().max(60).nullable().optional()),
});

export type ProjectCreateInput = z.infer<typeof projectCreateSchema>;
export type ProjectUpdateInput = z.infer<typeof projectUpdateSchema>;
export type NoteCreateInput = z.infer<typeof noteCreateSchema>;
export type ConnectionCreateInput = z.infer<typeof connectionCreateSchema>;

/** Formt Zod-Fehler in ein flaches Objekt fuer die API-Antwort. */
export function formatZodError(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    if (!result[key]) result[key] = issue.message;
  }
  return result;
}
