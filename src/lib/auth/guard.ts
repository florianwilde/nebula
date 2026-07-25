import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { getSessionUser, type SessionUser } from "@/lib/auth/session";
import { getInstanceState } from "@/lib/auth/settings";

/**
 * Zugriffsschutz.
 *
 * Die Middleware prueft nur, ob ueberhaupt ein Sitzungscookie mitkommt – im
 * Edge-Runtime steht keine Datenbank zur Verfuegung. Die eigentliche
 * Entscheidung faellt hier, serverseitig, und zwar in jeder Seite und jedem
 * API-Endpunkt. Das ist die Sicherheitsgrenze.
 */

export type { SessionUser };

/** Fuer Server Components: leitet auf /login bzw. /setup um. */
export async function requireUserPage(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (user) return user;

  const state = await getInstanceState();
  redirect(state.needsSetup ? "/setup" : "/login");
}

/** Wie requireUserPage, verlangt zusaetzlich die Administratorrolle. */
export async function requireAdminPage(): Promise<SessionUser> {
  const user = await requireUserPage();
  if (user.role !== "ADMIN") redirect("/");
  return user;
}

export type ApiAuth =
  | { ok: true; user: SessionUser }
  | { ok: false; response: NextResponse };

/** Fuer Route Handler: liefert entweder den Benutzer oder eine 401/403-Antwort. */
export async function requireUserApi(): Promise<ApiAuth> {
  const user = await getSessionUser();
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 }),
    };
  }
  return { ok: true, user };
}

export async function requireAdminApi(): Promise<ApiAuth> {
  const auth = await requireUserApi();
  if (!auth.ok) return auth;
  if (auth.user.role !== "ADMIN") {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Diese Aktion ist Administratoren vorbehalten." },
        { status: 403 },
      ),
    };
  }
  return auth;
}
