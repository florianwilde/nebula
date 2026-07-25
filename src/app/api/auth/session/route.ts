import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getInstanceState } from "@/lib/auth/settings";
import { WEBAUTHN_AVAILABLE } from "@/lib/config";

export const dynamic = "force-dynamic";

/** Zustand fuer die Anmeldeseite und zum Pruefen der eigenen Sitzung. */
export async function GET() {
  const [user, state] = await Promise.all([getSessionUser(), getInstanceState()]);

  return NextResponse.json({
    user,
    needsSetup: state.needsSetup,
    registrationOpen: state.registrationOpen,
    multiUser: state.multiUser,
    passkeysAvailable: WEBAUTHN_AVAILABLE,
  });
}
