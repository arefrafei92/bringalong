import { env } from "cloudflare:workers";
import { GOOGLE_SIGNIN_ENABLED } from "@/lib/auth-features";
import { beginGoogleLogin, safeReturnPath } from "@/lib/google-auth";

export async function GET(request: Request) {
  if (!GOOGLE_SIGNIN_ENABLED) {
    return Response.json({ error: "Google sign-in is temporarily unavailable. Continue with email for now." }, { status: 503 });
  }
  if (!env.GOOGLE_CLIENT_ID || !env.SESSION_SECRET) {
    return Response.json({ error: "Google sign-in is not configured yet." }, { status: 503 });
  }
  const returnTo = safeReturnPath(new URL(request.url).searchParams.get("return_to"));
  const login = await beginGoogleLogin(request, env.GOOGLE_CLIENT_ID, env.SESSION_SECRET, returnTo);
  return new Response(null, {
    status: 302,
    headers: {
      Location: login.location,
      "Set-Cookie": login.cookie,
      "Cache-Control": "no-store",
    },
  });
}
