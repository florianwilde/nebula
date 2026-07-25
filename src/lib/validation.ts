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
