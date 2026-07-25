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
  repoUrl: z.preprocess(emptyToNull, z.string().trim().max(500).nullable().optional()),
  repoOwner: z.preprocess(emptyToNull, z.string().trim().max(200).nullable().optional()),
  repoName: z.preprocess(emptyToNull, z.string().trim().max(200).nullable().optional()),
  connectionId: z.preprocess(emptyToNull, z.string().trim().nullable().optional()),
});

export const projectUpdateSchema = projectCreateSchema.partial();

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
