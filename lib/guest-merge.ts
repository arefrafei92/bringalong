import { isGuestUser, mergeGuestIntoAccount } from "@/lib/guest";
import { readCookie, readSession, SESSION_COOKIE, type SessionUser } from "@/lib/session";

/** Resolve a guest session to merge from the live cookie and/or a localStorage-backed guest token. */
export async function guestToMerge(
  request: Request,
  secret: string,
  guestToken?: string | null,
): Promise<SessionUser | null> {
  const fromCookie = readCookie(request, SESSION_COOKIE);
  const cookieUser = fromCookie ? await readSession(fromCookie, secret) : null;
  if (cookieUser && (cookieUser.guest || (await isGuestUser(cookieUser.id)))) return cookieUser;

  if (!guestToken || typeof guestToken !== "string") return null;
  const tokenUser = await readSession(guestToken, secret);
  if (!tokenUser) return null;
  if (tokenUser.guest || (await isGuestUser(tokenUser.id))) return tokenUser;
  return null;
}

export async function mergeGuestSessionIntoAccount(
  request: Request,
  secret: string,
  accountId: string,
  guestToken?: string | null,
): Promise<void> {
  const guest = await guestToMerge(request, secret, guestToken);
  if (!guest || guest.id === accountId) return;
  await mergeGuestIntoAccount(guest.id, accountId);
}
