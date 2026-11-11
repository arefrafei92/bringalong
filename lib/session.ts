export const SESSION_COOKIE = "ba_session";
export const OAUTH_COOKIE = "ba_oauth";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  guest?: boolean;
};

type SessionPayload = SessionUser & { exp: number };

const encoder = new TextEncoder();

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function hmac(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return bytesToBase64Url(new Uint8Array(signature));
}

function timingSafeEqual(a: string, b: string): boolean {
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  const length = Math.max(left.length, right.length);
  let diff = left.length ^ right.length;
  for (let i = 0; i < length; i++) diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  return diff === 0;
}

export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [rawName, ...rest] = part.trim().split("=");
    if (rawName === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

export async function signValue(payload: unknown, secret: string): Promise<string> {
  const body = bytesToBase64Url(encoder.encode(JSON.stringify(payload)));
  return `${body}.${await hmac(body, secret)}`;
}

export async function readSignedValue<T>(token: string, secret: string): Promise<T | null> {
  const separator = token.lastIndexOf(".");
  if (separator <= 0) return null;
  const body = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  const expected = await hmac(body, secret);
  if (!timingSafeEqual(signature, expected)) return null;
  try {
    return JSON.parse(new TextDecoder().decode(base64UrlToBytes(body))) as T;
  } catch {
    return null;
  }
}

export async function signSession(user: SessionUser, secret: string, maxAgeSeconds = 60 * 60 * 24 * 30): Promise<string> {
  const payload: SessionPayload = { ...user, exp: Math.floor(Date.now() / 1000) + maxAgeSeconds };
  return signValue(payload, secret);
}

export async function readSession(token: string, secret: string): Promise<SessionUser | null> {
  const payload = await readSignedValue<SessionPayload>(token, secret);
  if (!payload?.id || !payload.email || !payload.name || !payload.exp) return null;
  if (payload.exp <= Math.floor(Date.now() / 1000)) return null;
  return {
    id: payload.id,
    email: payload.email,
    name: payload.name,
    ...(payload.guest ? { guest: true } : {}),
  };
}

export function sessionCookie(token: string, secure: boolean, maxAgeSeconds = 60 * 60 * 24 * 30): string {
  return cookie(SESSION_COOKIE, token, secure, maxAgeSeconds);
}

export function clearCookie(name: string, secure: boolean): string {
  return cookie(name, "", secure, 0);
}

function cookie(name: string, value: string, secure: boolean, maxAgeSeconds: number): string {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}
