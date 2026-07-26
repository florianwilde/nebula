import { NextResponse, type NextRequest } from "next/server";

/**
 * Erste Verteidigungslinie – laeuft vor jeder Anfrage.
 *
 *  1. CSRF: schreibende Anfragen muessen vom eigenen Origin kommen.
 *  2. Sicherheitskopfzeilen inklusive Content-Security-Policy mit Nonce.
 *  3. Grobe Zugangsschranke: ohne Sitzungscookie geht es zur Anmeldung.
 *
 * Wichtig: Punkt 3 ist nur Bequemlichkeit und Lastschutz, keine
 * Sicherheitsgrenze. Die Middleware laeuft im Edge-Runtime und kann das
 * Token nicht gegen die Datenbank pruefen. Verbindlich entschieden wird in
 * requireUserPage bzw. requireUserApi – also serverseitig in jeder Seite und
 * jedem Endpunkt.
 */

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const SESSION_COOKIE = "nebula_session";

/** Ohne Anmeldung erreichbar. */
const PUBLIC_PATHS = ["/login", "/setup", "/register"];
const PUBLIC_API_PREFIXES = ["/api/auth/"];
/**
 * Der Docker-Healthcheck hat kein Cookie. Manifest und Symbole braucht der
 * Browser, bevor sich jemand angemeldet hat – wuerden sie zur Anmeldeseite
 * umgeleitet, liesse sich die Anwendung nicht installieren und die
 * Anmeldeseite haette kein Symbol.
 */
const PUBLIC_API_EXACT = ["/api/health", "/manifest.webmanifest"];

/** Bilder und aehnliches im Wurzelverzeichnis verraten nichts. */
const PUBLIC_FILE = /\.(png|svg|ico|webmanifest|txt|webp)$/;

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  if (PUBLIC_API_EXACT.includes(pathname)) return true;
  if (PUBLIC_FILE.test(pathname)) return true;
  return PUBLIC_API_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

/**
 * Gleicher Ursprung?
 *
 * Moderne Browser senden Sec-Fetch-Site bei jeder Anfrage und Origin bei
 * jeder schreibenden. Fehlen beide, stammt die Anfrage nicht aus einem
 * Browser (curl, Skript, Cronjob) und ist damit kein CSRF-Vektor – solche
 * Aufrufe bleiben erlaubt, damit die API skriptbar bleibt.
 */
function isSameOrigin(request: NextRequest): boolean {
  const site = request.headers.get("sec-fetch-site");
  if (site) return site === "same-origin" || site === "none";

  const origin = request.headers.get("origin");
  if (origin) {
    try {
      return new URL(origin).host === request.headers.get("host");
    } catch {
      return false;
    }
  }

  return true;
}

function buildCsp(nonce: string, isDev: boolean): string {
  const scriptSrc = isDev
    ? `'self' 'nonce-${nonce}' 'unsafe-eval' 'strict-dynamic'`
    : `'self' 'nonce-${nonce}' 'strict-dynamic'`;

  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    // Inline-Styles sind noetig: React setzt style-Attribute fuer die
    // Akzentfarben, Next liefert kritisches CSS inline aus.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    // Der Browser spricht nur mit der eigenen Instanz; die Git-APIs ruft
    // ausschliesslich der Server auf.
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "manifest-src 'self'",
  ].join("; ");
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isDev = process.env.NODE_ENV === "development";

  // ── 1. CSRF ────────────────────────────────────────────────
  if (!SAFE_METHODS.has(request.method) && !isSameOrigin(request)) {
    return NextResponse.json(
      { error: "Anfrage von fremdem Ursprung abgelehnt." },
      { status: 403 },
    );
  }

  // ── 2. Zugangsschranke ─────────────────────────────────────
  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE)?.value);
  if (!hasSession && !isPublicPath(pathname)) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
    }
    const target = request.nextUrl.clone();
    target.pathname = "/login";
    target.search = "";
    // Nur den Pfad merken, keine absolute URL – sonst waere das ein
    // offener Redirect.
    if (pathname !== "/") target.searchParams.set("weiter", pathname);
    return NextResponse.redirect(target);
  }

  // ── 3. Kopfzeilen ──────────────────────────────────────────
  const nonce = crypto.randomUUID().replace(/-/g, "");
  const csp = buildCsp(nonce, isDev);

  // Next liest die Nonce aus der CSP der Anfrage und setzt sie auf seine
  // eigenen Skript-Tags.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });

  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "same-origin");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  );
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  response.headers.set("Cross-Origin-Resource-Policy", "same-origin");
  response.headers.set("X-DNS-Prefetch-Control", "off");

  return response;
}

export const config = {
  matcher: [
    /*
     * Alles ausser den statischen Auslieferungen von Next. Die brauchen
     * weder CSRF-Pruefung noch Nonce und wuerden nur Rechenzeit kosten.
     */
    {
      source: "/((?!_next/static|_next/image|favicon.ico|icon.svg).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
