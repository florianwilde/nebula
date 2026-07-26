import type { Metadata } from "next";
import { AccountManager, type AccountData } from "@/components/account/AccountManager";
import {
  NotificationSection,
  type NotificationTargetEntry,
} from "@/components/account/NotificationSection";
import { emailAvailable } from "@/lib/notify";
import { requireUserPage } from "@/lib/auth/guard";
import { WEBAUTHN_AVAILABLE } from "@/lib/config";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: "Mein Konto" };
}

export default async function AccountPage() {
  const user = await requireUserPage();

  const [passkeys, sessions, targets] = await Promise.all([
    prisma.credential.findMany({
      where: { userId: user.id },
      select: {
        id: true,
        name: true,
        deviceType: true,
        backedUp: true,
        createdAt: true,
        lastUsedAt: true,
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.session.findMany({
      where: { userId: user.id, expiresAt: { gt: new Date() } },
      select: {
        id: true,
        userAgent: true,
        ip: true,
        createdAt: true,
        lastSeenAt: true,
      },
      orderBy: { lastSeenAt: "desc" },
    }),
    prisma.notificationTarget.findMany({
      where: { userId: user.id },
      select: {
        id: true,
        name: true,
        channel: true,
        target: true,
        secretHint: true,
        events: true,
        isActive: true,
        lastSentAt: true,
        lastOk: true,
        lastMessage: true,
      },
      orderBy: { name: "asc" },
    }),
  ]);

  const data: AccountData = {
    username: user.username,
    displayName: user.displayName,
    email: user.email,
    role: user.role,
    hasPassword: user.hasPassword,
    passkeys,
    sessions,
    passkeysAvailable: WEBAUTHN_AVAILABLE,
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 pt-4">
      <header className="fade-up">
        <h1 className="text-2xl font-semibold tracking-tight text-white">Mein Konto</h1>
        <p className="mt-1 text-sm text-slate-400">
          Profil, Anmeldemittel und aktive Sitzungen.
        </p>
      </header>

      <AccountManager data={data} />

      <NotificationSection
        targets={targets as unknown as NotificationTargetEntry[]}
        emailAvailable={emailAvailable()}
      />
    </div>
  );
}
