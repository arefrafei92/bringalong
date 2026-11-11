import { env } from "cloudflare:workers";
import { GOOGLE_SIGNIN_ENABLED } from "@/lib/auth-features";
import { clearOAuthCookie, finishGoogleLogin, safeReturnPath } from "@/lib/google-auth";
import { accountForGoogle } from "@/lib/google-user";
import { sessionCookie, signSession } from "@/lib/session";

export async function GET(request: Request) {
  const secure = new URL(request.url).protocol === "https:";
  const fail = (message: string) => {
    const location = `/?auth_error=${encodeURIComponent(message)}`;
    return new Response(null, {
      status: 302,
      headers: {
        Location: location,
        "Set-Cookie": clearOAuthCookie(request),
        "Cache-Control": "no-store",
      },
    });
  };
  if (!GOOGLE_SIGNIN_ENABLED) return fail("Google sign-in is temporarily unavailable. Continue with email for now.");
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.SESSION_SECRET) return fail("Google sign-in is not configured yet.");
  try {
    const google = await finishGoogleLogin(request, env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, env.SESSION_SECRET);
    const account = await accountForGoogle(google);
    const headers = new Headers({
      Location: safeReturnPath(google.returnTo),
      "Cache-Control": "no-store",
    });
    headers.append("Set-Cookie", clearOAuthCookie(request));
    headers.append("Set-Cookie", sessionCookie(await signSession(account, env.SESSION_SECRET), secure));
    return new Response(null, { status: 302, headers });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Google sign-in failed.");
  }
}
