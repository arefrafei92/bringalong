/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { readCookie, readSession, SESSION_COOKIE } from "../lib/session";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  SESSION_SECRET?: string;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image optimization: vector artwork is served as static assets, not through
// the optimizer endpoint. Keep executable image formats out of HTML embedding.

const IDENTITY_HEADERS = [
  "oai-authenticated-user-id",
  "oai-authenticated-user-email",
  "oai-authenticated-user-full-name",
  "oai-authenticated-user-full-name-encoding",
];

// Identity headers are not trusted from the browser. Only a verified Google
// session cookie may set them — never invent a local default user.
async function withUser(request: Request, env: Env): Promise<Request> {
  const headers = new Headers(request.headers);
  for (const name of IDENTITY_HEADERS) headers.delete(name);
  const token = env.SESSION_SECRET ? readCookie(request, SESSION_COOKIE) : null;
  const user = token && env.SESSION_SECRET ? await readSession(token, env.SESSION_SECRET) : null;
  if (user) {
    headers.set("oai-authenticated-user-id", user.id);
    headers.set("oai-authenticated-user-email", user.email);
    headers.set("oai-authenticated-user-full-name", user.name);
  }
  return new Request(request, { headers });
}

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    request = await withUser(request, env);
    const url = new URL(request.url);

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    const response = await handler.fetch(request, env, ctx);
    const headers = new Headers(response.headers);
    if (!headers.has("Content-Security-Policy")) {
      headers.set(
        "Content-Security-Policy",
        "frame-ancestors 'self'",
      );
    }
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
};

export default worker;
