import { PrismaClient } from "@prisma/client";

/**
 * Im Dev-Modus laedt Next die Module bei jedem Hot-Reload neu. Ohne diesen
 * Cache wuerde pro Reload eine neue Verbindung zur Datenbank aufgebaut.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["warn", "error"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
