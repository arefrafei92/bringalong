import { database } from "@/db/raw";

export const GUEST_EMAIL_DOMAIN = "bringalong.guest";
export const GUEST_PASSWORD = "guest";

export function guestEmailFor(id: string): string {
  return `guest-${id}@${GUEST_EMAIL_DOMAIN}`;
}

export function isGuestEmail(email: string | null | undefined): boolean {
  return !!email && email.toLowerCase().endsWith(`@${GUEST_EMAIL_DOMAIN}`);
}

export function normalizeGuestName(name: string): string {
  const trimmed = name.trim().replace(/\s+/g, " ").slice(0, 80);
  if (!trimmed) throw new Error("Enter a name so your group knows who’s bringing what.");
  if (/[\p{Cc}\p{Zl}\p{Zp}]/u.test(trimmed)) throw new Error("Choose a simpler display name.");
  return trimmed;
}

export function normalizeGuestAvatar(avatarText: string, name: string): string {
  const text = avatarText.trim() || name.trim().split(/\s+/).slice(0, 2).map((s) => s[0]).join("").toUpperCase() || "?";
  const segments = [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text)];
  if (!text || text.length > 40 || segments.length > 3 || /[\p{Cc}\p{Zl}\p{Zp}]/u.test(text)) {
    throw new Error("Choose one emoji or up to three text characters for your icon.");
  }
  return text;
}

export function normalizeGuestColor(color: string): string {
  if (!/^#[0-9a-f]{6}$/i.test(color)) throw new Error("Choose a valid icon color.");
  return color.toLowerCase();
}

export async function createGuest(input: { name: string; avatarText?: string; color?: string }): Promise<{
  id: string;
  email: string;
  name: string;
  guest: true;
}> {
  const name = normalizeGuestName(input.name);
  const avatarText = normalizeGuestAvatar(input.avatarText || "", name);
  const color = normalizeGuestColor(input.color || "#2563eb");
  const id = crypto.randomUUID();
  const email = guestEmailFor(id);
  const db = database();
  await db.batch([
    db
      .prepare("INSERT INTO users (id, email, name, password_hash, created_at, google_sub) VALUES (?, ?, ?, ?, ?, NULL)")
      .bind(id, email, name, GUEST_PASSWORD, Date.now()),
    db.prepare("INSERT INTO avatar_profiles (user_id, avatar_text, color) VALUES (?, ?, ?)").bind(id, avatarText, color),
  ]);
  return { id, email, name, guest: true };
}

export async function isGuestUser(userId: string): Promise<boolean> {
  const user = await database()
    .prepare("SELECT email, password_hash AS passwordHash FROM users WHERE id = ?")
    .bind(userId)
    .first<{ email: string; passwordHash: string }>();
  return !!user && (user.passwordHash === GUEST_PASSWORD || isGuestEmail(user.email));
}

/** Move gathering membership and claim history from a guest onto a real account, then delete the guest. */
export async function mergeGuestIntoAccount(guestId: string, accountId: string): Promise<void> {
  if (guestId === accountId) return;
  const db = database();
  const guest = await db
    .prepare("SELECT id, email, password_hash AS passwordHash FROM users WHERE id = ?")
    .bind(guestId)
    .first<{ id: string; email: string; passwordHash: string }>();
  if (!guest || (guest.passwordHash !== GUEST_PASSWORD && !isGuestEmail(guest.email))) {
    return;
  }
  const account = await db.prepare("SELECT id FROM users WHERE id = ?").bind(accountId).first<{ id: string }>();
  if (!account) throw new Error("Could not save your guest session to this account.");

  const memberships = (
    await db.prepare("SELECT group_id AS groupId, name FROM members WHERE user_id = ?").bind(guestId).all<{ groupId: string; name: string }>()
  ).results;

  const statements = [];
  for (const membership of memberships) {
    statements.push(
      db
        .prepare("INSERT OR IGNORE INTO members (group_id, user_id, name) VALUES (?, ?, ?)")
        .bind(membership.groupId, accountId, membership.name),
    );
  }
  statements.push(db.prepare("DELETE FROM members WHERE user_id = ?").bind(guestId));
  statements.push(db.prepare("UPDATE items SET assignee = ? WHERE assignee = ?").bind(accountId, guestId));
  statements.push(
    db
      .prepare(
        "INSERT OR IGNORE INTO item_packing (item_id, user_id) SELECT item_id, ? FROM item_packing WHERE user_id = ?",
      )
      .bind(accountId, guestId),
  );
  statements.push(db.prepare("DELETE FROM item_packing WHERE user_id = ?").bind(guestId));
  statements.push(db.prepare("DELETE FROM join_attempts WHERE user_id = ?").bind(guestId));
  const accountAvatar = await db.prepare("SELECT 1 AS ok FROM avatar_profiles WHERE user_id = ?").bind(accountId).first();
  if (!accountAvatar) {
    statements.push(
      db
        .prepare(
          "INSERT INTO avatar_profiles (user_id, avatar_text, color) SELECT ?, avatar_text, color FROM avatar_profiles WHERE user_id = ?",
        )
        .bind(accountId, guestId),
    );
  }
  statements.push(db.prepare("DELETE FROM avatar_profiles WHERE user_id = ?").bind(guestId));
  statements.push(db.prepare("DELETE FROM users WHERE id = ?").bind(guestId));
  await db.batch(statements);
}
