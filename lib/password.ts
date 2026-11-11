function hex(bytes: ArrayBuffer | Uint8Array) {
  return Array.from(new Uint8Array(bytes instanceof Uint8Array ? bytes.buffer : bytes))
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
}

async function derive(password: string, salt: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  return hex(
    await crypto.subtle.deriveBits(
      { name: "PBKDF2", hash: "SHA-256", iterations: 100_000, salt: new TextEncoder().encode(salt) },
      key,
      256,
    ),
  );
}

export async function hashPassword(password: string) {
  const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
  return `${salt}:${await derive(password, salt)}`;
}

export async function verifyPassword(password: string, stored: string) {
  if (!stored || stored === "google" || !stored.includes(":")) return false;
  const [salt, expected] = stored.split(":");
  if (!salt || !expected) return false;
  const actual = await derive(password, salt);
  let diff = actual.length ^ expected.length;
  for (let i = 0; i < actual.length; i++) diff |= actual.charCodeAt(i) ^ (expected.charCodeAt(i) || 0);
  return diff === 0;
}

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export function validateEmail(value: string) {
  const email = normalizeEmail(value);
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Enter a valid email address.");
  }
  return email;
}

export function validateAccountPassword(value: string) {
  if (typeof value !== "string" || value.length < 8 || value.length > 128) {
    throw new Error("Use a password between 8 and 128 characters.");
  }
  return value;
}
