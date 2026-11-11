import { database } from "@/db/raw";
import { hashPassword, normalizeEmail, validateAccountPassword, validateEmail, verifyPassword } from "@/lib/password";

export type Account = { id: string; email: string; name: string };

export async function signupWithEmail(input: { email: string; password: string; name?: string }): Promise<Account> {
  const email = validateEmail(input.email);
  const password = validateAccountPassword(input.password);
  const name = (input.name?.trim() || email.split("@")[0] || "You").slice(0, 80);
  const db = database();
  const existing = await db.prepare("SELECT id, password_hash AS passwordHash FROM users WHERE lower(email) = ?").bind(email).first<{ id: string; passwordHash: string }>();
  if (existing) {
    if (existing.passwordHash === "google") throw new Error("This email is linked to Google sign-in, which is temporarily unavailable. Try again later or use a different email.");
    throw new Error("An account with this email already exists. Sign in instead.");
  }
  const id = crypto.randomUUID();
  await db
    .prepare("INSERT INTO users (id, email, name, password_hash, created_at, google_sub) VALUES (?, ?, ?, ?, ?, NULL)")
    .bind(id, email, name, await hashPassword(password), Date.now())
    .run();
  return { id, email, name };
}

export async function loginWithEmail(input: { email: string; password: string }): Promise<Account> {
  const email = validateEmail(input.email);
  const password = validateAccountPassword(input.password);
  const db = database();
  const user = await db
    .prepare("SELECT id, name, password_hash AS passwordHash FROM users WHERE lower(email) = ?")
    .bind(email)
    .first<{ id: string; name: string; passwordHash: string }>();
  if (!user) throw new Error("Email or password is incorrect.");
  if (user.passwordHash === "google") throw new Error("This email is linked to Google sign-in, which is temporarily unavailable. Try again later.");
  if (!(await verifyPassword(password, user.passwordHash))) throw new Error("Email or password is incorrect.");
  return { id: user.id, email, name: user.name || normalizeEmail(email).split("@")[0] || "You" };
}

/** Existing members sign in; new emails create an account with the same password. */
export async function continueWithEmail(input: { email: string; password: string; name?: string }): Promise<Account & { created: boolean }> {
  const email = validateEmail(input.email);
  const password = validateAccountPassword(input.password);
  const db = database();
  const user = await db
    .prepare("SELECT id, name, password_hash AS passwordHash FROM users WHERE lower(email) = ?")
    .bind(email)
    .first<{ id: string; name: string; passwordHash: string }>();
  if (!user) {
    const account = await signupWithEmail(input);
    return { ...account, created: true };
  }
  if (user.passwordHash === "google") throw new Error("This email is linked to Google sign-in, which is temporarily unavailable. Try again later.");
  if (!(await verifyPassword(password, user.passwordHash))) throw new Error("Email or password is incorrect.");
  return {
    id: user.id,
    email,
    name: user.name || normalizeEmail(email).split("@")[0] || "You",
    created: false,
  };
}
