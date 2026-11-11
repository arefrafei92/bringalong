import { database } from "@/db/raw";

export type Account = { id: string; email: string; name: string };

type GoogleAccount = { sub: string; email: string; name: string };

export async function accountForGoogle(profile: GoogleAccount): Promise<Account> {
  const db = database();
  const email = profile.email.trim().toLowerCase();
  const name = profile.name.trim().slice(0, 80) || email.split("@")[0] || "You";
  const existing = await db
    .prepare("SELECT id, name, google_sub AS googleSub FROM users WHERE lower(email) = ?")
    .bind(email)
    .first<{ id: string; name: string; googleSub: string | null }>();
  if (existing) {
    // Same email = same account. Linking google_sub keeps password login working too.
    if (existing.googleSub && existing.googleSub !== profile.sub) {
      throw new Error("This email is already linked to a different Google account.");
    }
    await db.prepare("UPDATE users SET google_sub = ? WHERE id = ?").bind(profile.sub, existing.id).run();
    return { id: existing.id, email, name: existing.name || name };
  }
  const id = crypto.randomUUID();
  await db
    .prepare("INSERT INTO users (id, email, name, password_hash, created_at, google_sub) VALUES (?, ?, ?, 'google', ?, ?)")
    .bind(id, email, name, Date.now(), profile.sub)
    .run();
  return { id, email, name };
}
