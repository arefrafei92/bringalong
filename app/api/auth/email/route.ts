import { env } from "cloudflare:workers";
import { continueWithEmail, loginWithEmail, signupWithEmail } from "@/lib/accounts";
import { sessionCookie, signSession } from "@/lib/session";

export async function POST(request: Request) {
  if (!env.SESSION_SECRET) {
    return Response.json({ error: "Sign-in is not configured yet." }, { status: 503 });
  }
  try {
    if (request.headers.get("origin") && request.headers.get("origin") !== new URL(request.url).origin) {
      return Response.json({ error: "Invalid request origin." }, { status: 403 });
    }
    const body = (await request.json()) as { action?: string; email?: string; password?: string; name?: string };
    const email = String(body.email || "");
    const password = String(body.password || "");
    const result =
      body.action === "continue" || !body.action
        ? await continueWithEmail({ email, password, name: body.name })
        : body.action === "signup"
          ? { ...(await signupWithEmail({ email, password, name: body.name })), created: true }
          : body.action === "login"
            ? { ...(await loginWithEmail({ email, password })), created: false }
            : null;
    if (!result) return Response.json({ error: "Could not continue with email." }, { status: 400 });
    const { created, ...account } = result;
    const secure = new URL(request.url).protocol === "https:";
    return Response.json(
      { ok: true, created, me: account },
      {
        headers: {
          "Set-Cookie": sessionCookie(await signSession(account, env.SESSION_SECRET), secure),
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not sign in." }, { status: 400 });
  }
}
