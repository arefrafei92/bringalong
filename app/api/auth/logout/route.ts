import { clearCookie, SESSION_COOKIE } from "@/lib/session";

export async function POST(request: Request) {
  const secure = new URL(request.url).protocol === "https:";
  return new Response(null, {
    status: 204,
    headers: {
      "Set-Cookie": clearCookie(SESSION_COOKIE, secure),
      "Cache-Control": "no-store",
    },
  });
}
