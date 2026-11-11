import { OAUTH_COOKIE, clearCookie, readSignedValue, signValue } from "./session";

const GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO = "https://openidconnect.googleapis.com/v1/userinfo";

export type GoogleProfile = {
  sub: string;
  email: string;
  name: string;
};

type OAuthState = {
  state: string;
  verifier: string;
  returnTo: string;
  exp: number;
};

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  let binary = "";
  for (const byte of new Uint8Array(digest)) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export function safeReturnPath(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  try {
    const url = new URL(value, "https://app.local");
    if (url.origin !== "https://app.local") return "/";
    if (url.pathname.startsWith("/api/auth/")) return "/";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/";
  }
}

export function redirectUri(request: Request): string {
  return new URL("/api/auth/google/callback", request.url).toString();
}

export async function beginGoogleLogin(request: Request, clientId: string, secret: string, returnTo: string) {
  const state = randomToken();
  const verifier = randomToken();
  const payload: OAuthState = {
    state,
    verifier,
    returnTo,
    exp: Math.floor(Date.now() / 1000) + 60 * 10,
  };
  const secure = new URL(request.url).protocol === "https:";
  const location = new URL(GOOGLE_AUTH);
  location.searchParams.set("client_id", clientId);
  location.searchParams.set("redirect_uri", redirectUri(request));
  location.searchParams.set("response_type", "code");
  location.searchParams.set("scope", "openid email profile");
  location.searchParams.set("state", state);
  location.searchParams.set("code_challenge", await sha256(verifier));
  location.searchParams.set("code_challenge_method", "S256");
  location.searchParams.set("prompt", "select_account");
  return {
    location: location.toString(),
    cookie: `${OAUTH_COOKIE}=${encodeURIComponent(await signValue(payload, secret))}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600${secure ? "; Secure" : ""}`,
  };
}

export async function finishGoogleLogin(request: Request, clientId: string, clientSecret: string, sessionSecret: string): Promise<GoogleProfile & { returnTo: string }> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookie = request.headers.get("cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${OAUTH_COOKIE}=`))?.slice(OAUTH_COOKIE.length + 1);
  if (!code || !state || !cookie) throw new Error("Sign-in expired. Please try again.");
  const saved = await readSignedValue<OAuthState>(decodeURIComponent(cookie), sessionSecret);
  if (!saved || saved.exp <= Math.floor(Date.now() / 1000) || saved.state !== state) {
    throw new Error("Sign-in expired. Please try again.");
  }

  const tokenResponse = await fetch(GOOGLE_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri(request),
      grant_type: "authorization_code",
      code_verifier: saved.verifier,
    }),
  });
  const token = await tokenResponse.json() as { access_token?: string };
  if (!tokenResponse.ok || !token.access_token) throw new Error("Google did not accept the sign-in.");

  const profileResponse = await fetch(GOOGLE_USERINFO, {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  const profile = await profileResponse.json() as { sub?: string; email?: string; email_verified?: boolean; name?: string };
  if (!profileResponse.ok || !profile.sub || !profile.email || profile.email_verified !== true) {
    throw new Error("Google did not confirm this email address.");
  }
  const name = (profile.name || profile.email.split("@")[0] || "You").trim().slice(0, 80);
  return { sub: profile.sub, email: profile.email, name, returnTo: saved.returnTo };
}

export function clearOAuthCookie(request: Request): string {
  return clearCookie(OAUTH_COOKIE, new URL(request.url).protocol === "https:");
}
