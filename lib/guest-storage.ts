export const GUEST_STORAGE_KEY = "ba_guest";

export type GuestLocal = { id: string; token?: string };

export function readGuestLocal(): GuestLocal | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(GUEST_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GuestLocal;
    if (!parsed?.id || typeof parsed.id !== "string") return null;
    return { id: parsed.id, ...(typeof parsed.token === "string" ? { token: parsed.token } : {}) };
  } catch {
    return null;
  }
}

export function writeGuestLocal(id: string, token?: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      GUEST_STORAGE_KEY,
      JSON.stringify({ id, ...(token ? { token } : {}) } satisfies GuestLocal),
    );
  } catch {
    /* private mode / quota */
  }
}

export function clearGuestLocal(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(GUEST_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
