import { env } from "cloudflare:workers";
import { database } from "@/db/raw";
import { readCookie, readSession, SESSION_COOKIE } from "@/lib/session";

type DiscoverRow = {
  id: string;
  name: string;
  occasion: string;
  date: string;
  location: string;
  code: string;
  visibility: string;
  createdAt: number;
  memberCount: number;
  memberLimit: number | null;
};

function dayDiff(date: string) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return Math.round((new Date(date + "T00:00:00").getTime() - start.getTime()) / 86400000);
}

export async function GET(request: Request) {
  try {
    const db = database();
    await db.prepare("DELETE FROM gatherings WHERE remove_at IS NOT NULL AND remove_at <= ?").bind(Date.now()).run();

    let excludeUserId: string | null = null;
    if (env.SESSION_SECRET) {
      const token = readCookie(request, SESSION_COOKIE);
      const session = token ? await readSession(token, env.SESSION_SECRET) : null;
      excludeUserId = session?.id || null;
    }

    const rows = (
      await db
        .prepare(
          `SELECT g.id, g.name, g.occasion, g.date, g.location, g.code, g.visibility, g.created_at AS createdAt,
            g.member_limit AS memberLimit,
            (SELECT COUNT(*) FROM members WHERE group_id = g.id) AS memberCount
           FROM gatherings g
           WHERE g.visibility IN ('public', 'protected')
             AND (g.remove_at IS NULL OR g.remove_at > ?)
             AND (g.member_limit IS NULL OR (SELECT COUNT(*) FROM members WHERE group_id = g.id) < g.member_limit)
             AND (? IS NULL OR g.id NOT IN (SELECT group_id FROM members WHERE user_id = ?))
           ORDER BY g.created_at DESC
           LIMIT 40`,
        )
        .bind(Date.now(), excludeUserId, excludeUserId)
        .all<DiscoverRow>()
    ).results;

    const upcoming = rows
      .filter((g) => g.date && dayDiff(g.date) >= 0)
      .sort((a, b) => dayDiff(a.date) - dayDiff(b.date) || b.createdAt - a.createdAt);
    const recent = [...rows].sort((a, b) => b.createdAt - a.createdAt);

    const picked: DiscoverRow[] = [];
    const seen = new Set<string>();
    for (const g of [...upcoming.slice(0, 6), ...recent]) {
      if (seen.has(g.id)) continue;
      seen.add(g.id);
      picked.push(g);
      if (picked.length >= 8) break;
    }

    const gatherings = picked.map((g) => {
      const locked = g.visibility === "protected";
      return {
        id: g.id,
        name: g.name,
        occasion: g.occasion,
        date: g.date || "",
        code: g.code,
        locked,
        memberCount: g.memberCount,
        ...(locked
          ? {}
          : {
              location: g.location || "",
              ...(g.memberLimit != null ? { memberLimit: g.memberLimit } : {}),
            }),
      };
    });

    return Response.json({ gatherings }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Discover failed", error);
    return Response.json({ error: "Could not load open gatherings." }, { status: 503 });
  }
}
