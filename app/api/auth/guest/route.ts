import { env } from "cloudflare:workers";
import { createGuest } from "@/lib/guest";
import { sessionCookie, signSession } from "@/lib/session";

export async function POST(request: Request) {
  if (!env.SESSION_SECRET) {
    return Response.json({ error: "Sign-in is not configured yet." }, { status: 503 });
  }
  try {
    if (request.headers.get("origin") && request.headers.get("origin") !== new URL(request.url).origin) {
      return Response.json({ error: "Invalid request origin." }, { status: 403 });
    }
    const body = (await request.json()) as { name?: string; avatarText?: string; color?: string };
    const guest = await createGuest({
      name: String(body.name || ""),
      avatarText: typeof body.avatarText === "string" ? body.avatarText : undefined,
      color: typeof body.color === "string" ? body.color : undefined,
    });
    const secure = new URL(request.url).protocol === "https:";
    const account = { id: guest.id, email: guest.email, name: guest.name, guest: true as const };
    const token = await signSession(account, env.SESSION_SECRET);
    return Response.json(
      { ok: true, me: account, guestToken: token },
      {
        headers: {
          "Set-Cookie": sessionCookie(token, secure),
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not join as a guest." }, { status: 400 });
  }
}
