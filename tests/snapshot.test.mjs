import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

test("snapshot.json contains all required endpoints, both chains, and valid derived metrics", async () => {
  const raw = await fs.readFile(path.join(ROOT, "public", "data", "snapshot.json"), "utf8");
  const snap = JSON.parse(raw);

  assert.ok(Date.parse(snap.fetchedAtUtc) > 0, "fetchedAtUtc must be a valid ISO timestamp");
  assert.ok(snap.endpointsUsed.length >= 6, "must document all 6 required endpoints");

  assert.equal(typeof snap.marketStats.tempo.activeAgents7d, "number");
  assert.equal(typeof snap.marketStats.base.paidWorkers, "number");

  assert.ok(Array.isArray(snap.breakdowns.platform.status) && snap.breakdowns.platform.status.length > 0);
  assert.ok(Array.isArray(snap.breakdowns.platform.mode) && snap.breakdowns.platform.mode.length > 0);

  for (const r of ["7d", "30d", "90d", "all"]) {
    for (const b of ["day", "week"]) {
      assert.ok(Array.isArray(snap.timeSeries[`${r}_${b}`]), `missing timeSeries ${r}_${b}`);
    }
    assert.ok(Array.isArray(snap.heatmaps.hourOfWeek[r].cells), `missing hourOfWeek heatmap ${r}`);
    assert.ok(Array.isArray(snap.heatmaps.mode[r].cells), `missing mode heatmap ${r}`);
  }

  assert.ok(Array.isArray(snap.activityFeed) && snap.activityFeed.length > 0);

  for (const key of ["combined", "tempo", "base"]) {
    const a = snap.analytics[key];
    assert.ok(a.totalTasks > 0, `${key} totalTasks must be > 0`);
    assert.ok(a.weeklyPosters.length > 0, `${key} weeklyPosters must be non-empty`);
    assert.ok(a.flowLinks.posterToMode.length > 0, `${key} flowLinks must be non-empty`);
    assert.ok(a.swarmPoints.length > 0, `${key} swarmPoints must be non-empty`);
  }
  assert.equal(
    snap.analytics.combined.totalTasks,
    snap.analytics.tempo.totalTasks + snap.analytics.base.totalTasks,
    "combined tasks must equal tempo + base"
  );
});

test("frontend obeys all bounty rules: no browser API calls, required disclaimer, no banned words, OG PNG valid", async () => {
  const html = await fs.readFile(path.join(ROOT, "public", "index.html"), "utf8");
  const appJs = await fs.readFile(path.join(ROOT, "public", "app.js"), "utf8");
  const ogBuf = await fs.readFile(path.join(ROOT, "public", "og-share.png"));

  assert.ok(
    html.includes("Made for a paid Taskmarket bounty") && html.includes("not an official Taskmarket product"),
    "footer disclaimer must state made for a paid Taskmarket bounty and not an official product"
  );
  assert.ok(!/fetch\s*\([^)]*api\.taskmarket\.dev/i.test(appJs), "browser app.js must never call api.taskmarket.dev directly");
  assert.ok(!appJs.includes("https://api.taskmarket.dev"), "browser app.js must not embed direct API URL");
  assert.ok(appJs.includes("./data/snapshot.json"), "browser app.js must load server-cached snapshot.json");

  const combinedCopy = (html + "\n" + appJs).toLowerCase();
  for (const banned of ["revolutionary", "game-changing", "passive income", "get rich", "to the moon", "airdrop", "price prediction"]) {
    assert.ok(!combinedCopy.includes(banned), `banned brand-kit phrase found: ${banned}`);
  }

  // PNG magic + 1200x630 IHDR dimensions
  assert.equal(ogBuf.subarray(0, 8).toString("hex"), "89504e470d0a1a0a", "og-share.png must be a valid PNG");
  assert.equal(ogBuf.readUInt32BE(16), 1200, "og-share.png width must be 1200");
  assert.equal(ogBuf.readUInt32BE(20), 630, "og-share.png height must be 630");
});
