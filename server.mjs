import { createReadStream, existsSync, mkdirSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { networkInterfaces, tmpdir } from "node:os";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { AuthError, SESSION_TTL_MS, createAuthStore } from "./auth.mjs";
import { ProfileError, createProfileStore } from "./profiles.mjs";

const root = fileURLToPath(new URL(".", import.meta.url));
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || "0.0.0.0";
const isProduction = process.env.NODE_ENV === "production";
const databasePath =
  process.env.HEAR_YOU_DB ||
  (isProduction ? join(tmpdir(), "hear-you", "hear-you.db") : join(root, "data", "hear-you.db"));
const sessionCookie = "hear_you_session";
const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json"
};

let DatabaseSync = null;
if (process.env.HEAR_YOU_STORAGE !== "json") {
  try {
    ({ DatabaseSync } = await import("node:sqlite"));
  } catch {
    DatabaseSync = null;
  }
}

let auth;
let profiles;
let storageMode = "sqlite";
let storagePath = databasePath;

if (DatabaseSync) {
  if (databasePath !== ":memory:") {
    mkdirSync(dirname(databasePath), { recursive: true });
  }
  const db = new DatabaseSync(databasePath);
  auth = createAuthStore(db);
  profiles = createProfileStore(db);
} else {
  const { createJsonStores } = await import("./json-store.mjs");
  storageMode = "json";
  storagePath =
    databasePath === ":memory:"
      ? join(tmpdir(), "hear-you", "hear-you.json")
      : databasePath.replace(/\.db$/i, ".json");
  const stores = createJsonStores(storagePath);
  auth = stores.auth;
  profiles = stores.profiles;
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

function sendJson(response, status, payload, headers = {}) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers
  });
  response.end(JSON.stringify(payload));
}

function sessionCookieHeader(token) {
  return `${sessionCookie}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`;
}

function clearSessionCookieHeader() {
  return `${sessionCookie}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`;
}

function readSessionToken(request) {
  const header = request.headers.cookie;
  if (!header) return null;
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === sessionCookie) return rest.join("=");
  }
  return null;
}

async function readJson(request, maxBytes = 16 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBytes) {
      throw new HttpError(413, "请求内容过大。");
    }
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new HttpError(400, "请求内容不是有效的 JSON。");
  }
}

async function readJsonObject(request, maxBytes) {
  const value = await readJson(request, maxBytes);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpError(400, "请求内容格式不正确。");
  }
  return value;
}

async function handleApi(request, response, pathname) {
  if (pathname === "/api/register") {
    if (request.method !== "POST") throw new HttpError(405, "请求方法不被支持。");
    const { user, token } = auth.register(await readJsonObject(request));
    sendJson(response, 201, { user }, { "Set-Cookie": sessionCookieHeader(token) });
    return;
  }

  if (pathname === "/api/login") {
    if (request.method !== "POST") throw new HttpError(405, "请求方法不被支持。");
    const { user, token } = auth.login(await readJsonObject(request));
    sendJson(response, 200, { user }, { "Set-Cookie": sessionCookieHeader(token) });
    return;
  }

  if (pathname === "/api/logout") {
    if (request.method !== "POST") throw new HttpError(405, "请求方法不被支持。");
    auth.logout(readSessionToken(request));
    sendJson(response, 200, { ok: true }, { "Set-Cookie": clearSessionCookieHeader() });
    return;
  }

  if (pathname === "/api/me") {
    if (request.method !== "GET") throw new HttpError(405, "请求方法不被支持。");
    sendJson(response, 200, { user: auth.userForSession(readSessionToken(request)) });
    return;
  }

  if (pathname === "/api/profile") {
    const user = auth.userForSession(readSessionToken(request));
    if (!user) {
      throw new AuthError(401, "请先登录后再同步资料。");
    }

    if (request.method === "GET") {
      const record = profiles.get(user.id);
      sendJson(response, 200, {
        profile: record ? record.profile : null,
        updatedAt: record ? record.updatedAt : null
      });
      return;
    }

    if (request.method === "PUT") {
      const body = await readJsonObject(request, 600 * 1024);
      if (!body.profile || typeof body.profile !== "object" || Array.isArray(body.profile)) {
        throw new HttpError(400, "资料格式不正确。");
      }
      sendJson(response, 200, profiles.save(user.id, body.profile));
      return;
    }

    throw new HttpError(405, "请求方法不被支持。");
  }

  throw new HttpError(404, "接口不存在。");
}

function serveStatic(request, response, pathname) {
  let requestPath;
  try {
    requestPath = decodeURIComponent(pathname);
  } catch {
    response.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Bad request");
    return;
  }

  const blockedPrefixes = ["/data", "/.git", "/node_modules"];
  if (blockedPrefixes.some((prefix) => requestPath === prefix || requestPath.startsWith(`${prefix}/`))) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  const relativePath = requestPath === "/" ? "index.html" : requestPath.slice(1);
  const safePath = normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, "");
  const filePath = join(root, safePath);

  if (!filePath.startsWith(root) || !existsSync(filePath) || statSync(filePath).isDirectory()) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  response.writeHead(200, {
    "Content-Type": mimeTypes[extname(filePath)] || "application/octet-stream",
    "Cache-Control": "no-store"
  });
  createReadStream(filePath).pipe(response);
}

createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);

    if (url.pathname.startsWith("/api/")) {
      response.setHeader("Access-Control-Allow-Origin", "*");
      response.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS");
      response.setHeader("Access-Control-Allow-Headers", "Content-Type");
      response.setHeader("Access-Control-Max-Age", "600");

      if (request.method === "OPTIONS") {
        response.writeHead(204);
        response.end();
        return;
      }

      await handleApi(request, response, url.pathname);
      return;
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405, { "Content-Type": "text/plain; charset=utf-8", Allow: "GET, HEAD" });
      response.end("Method not allowed");
      return;
    }

    serveStatic(request, response, url.pathname);
  } catch (error) {
    const isExpected =
      error instanceof AuthError || error instanceof HttpError || error instanceof ProfileError;
    if (!isExpected) console.error(error);
    if (!response.headersSent) {
      sendJson(response, isExpected ? error.status : 500, {
        error: isExpected ? error.message : "服务器出了点问题，请稍后再试。"
      });
    } else {
      response.end();
    }
  }
}).listen(port, host, () => {
  console.log(`Hear You is running at http://127.0.0.1:${port}`);
  console.log(`Account storage (${storageMode}): ${storagePath}`);
  const localAddresses = Object.values(networkInterfaces())
    .flat()
    .filter((address) => address?.family === "IPv4" && !address.internal)
    .map((address) => address.address);
  localAddresses.forEach((address) => {
    console.log(`LAN: http://${address}:${port}`);
  });
});
