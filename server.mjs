/**
 * Standalone read-only Node server for Taskmarket Pulse (zero npm dependencies).
 * Serves static assets from public/, caches snapshot.json in memory (>= 60s TTL),
 * and refreshes data from https://api.taskmarket.dev every 30 minutes on the server.
 */
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { refreshSnapshot } from "./scripts/fetch-snapshot.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, "public");
const SNAPSHOT_PATH = path.join(PUBLIC_DIR, "data", "snapshot.json");
const PORT = Number(process.env.PORT || 4173);
const REFRESH_MS = Math.max(60_000, Number(process.env.REFRESH_INTERVAL_MS || 30 * 60_000));
const CACHE_TTL_SEC = 300;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".txt": "text/plain; charset=utf-8",
};

let cachedSnapshotText = null;
let cachedAtMs = 0;
let refreshInFlight = null;

async function ensureSnapshot(force = false) {
  const now = Date.now();
  if (!force && cachedSnapshotText && now - cachedAtMs < REFRESH_MS) {
    return cachedSnapshotText;
  }
  if (!force && !cachedSnapshotText) {
    try {
      const stat = await fs.stat(SNAPSHOT_PATH);
      if (now - stat.mtimeMs < REFRESH_MS) {
        cachedSnapshotText = await fs.readFile(SNAPSHOT_PATH, "utf8");
        cachedAtMs = stat.mtimeMs;
        return cachedSnapshotText;
      }
    } catch {
      // fall through to fetch
    }
  }
  if (!refreshInFlight) {
    refreshInFlight = refreshSnapshot()
      .then((snap) => {
        cachedSnapshotText = JSON.stringify(snap, null, 2) + "\n";
        cachedAtMs = Date.now();
        return cachedSnapshotText;
      })
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Method Not Allowed");
      return;
    }

    if (url.pathname === "/api/snapshot" || url.pathname === "/data/snapshot.json") {
      const body = await ensureSnapshot(false);
      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": `public, max-age=${CACHE_TTL_SEC}, stale-while-revalidate=600`,
      });
      res.end(req.method === "HEAD" ? undefined : body);
      return;
    }

    if (url.pathname === "/healthz") {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: true, cachedAtUtc: cachedAtMs ? new Date(cachedAtMs).toISOString() : null }));
      return;
    }

    let relPath = decodeURIComponent(url.pathname);
    if (relPath === "/" || relPath === "") relPath = "/index.html";
    const resolved = path.resolve(PUBLIC_DIR, "." + relPath);
    if (!resolved.startsWith(PUBLIC_DIR)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }

    const data = await fs.readFile(resolved);
    const ext = path.extname(resolved).toLowerCase();
    const isFontOrAsset = [".woff2", ".ttf", ".otf", ".png", ".jpg", ".svg"].includes(ext);
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Cache-Control": isFontOrAsset ? "public, max-age=86400" : "public, max-age=300",
    });
    res.end(req.method === "HEAD" ? undefined : data);
  } catch (err) {
    res.writeHead(err.code === "ENOENT" ? 404 : 500, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(err.code === "ENOENT" ? "Not Found" : "Internal Server Error");
  }
});

ensureSnapshot(false).catch((e) => console.error("[server] initial snapshot warning:", e.message));
setInterval(() => {
  ensureSnapshot(true).catch((e) => console.error("[server] scheduled refresh warning:", e.message));
}, REFRESH_MS).unref();

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[taskmarket-pulse] Listening on http://localhost:${PORT} (refresh every ${Math.round(REFRESH_MS / 60000)}m)`);
});
