/**
 * Server-side data fetcher for Taskmarket Pulse.
 * Fetches all required public endpoints from https://api.taskmarket.dev for Tempo (4217) and Base (8453),
 * paginates the full task lists to compute exact per-chain metrics, distinct weekly posters,
 * capital flow ribbons, swarm convergence coordinates, and market insights.
 * Zero external npm dependencies (Node 20+ native fetch).
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const BASE_URL = "https://api.taskmarket.dev";
const CHAINS = [
  { id: 4217, key: "tempo", label: "Tempo", asset: "OUSD" },
  { id: 8453, key: "base", label: "Base", asset: "USDC" },
];
const RANGES = ["7d", "30d", "90d", "all"];
const BUCKETS = ["day", "week"];

async function fetchJson(endpoint, retries = 3) {
  const url = `${BASE_URL}${endpoint}`;
  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": "taskmarket-pulse/1.0 (+https://github.com/oppo2357/taskmarket-pulse)",
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(25000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} on ${endpoint}`);
      return await res.json();
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 700 * attempt));
      }
    }
  }
  throw lastErr;
}

async function fetchAllTasks(chainId, maxPages = 60) {
  const tasks = [];
  const seen = new Set();
  let cursor = null;
  let pages = 0;

  while (pages < maxPages) {
    pages++;
    const qs = new URLSearchParams({
      chainId: String(chainId),
      sort: "newest",
      limit: "100",
    });
    if (cursor) qs.set("cursor", cursor);
    const page = await fetchJson(`/api/tasks?${qs.toString()}`);
    const batch = Array.isArray(page.tasks) ? page.tasks : [];
    let added = 0;
    for (const t of batch) {
      if (!seen.has(t.id)) {
        seen.add(t.id);
        tasks.push(t);
        added++;
      }
    }
    if (!page.hasMore || !page.nextCursor || added === 0) break;
    cursor = page.nextCursor;
  }
  return { tasks, pages };
}

function atomicToUsd(val) {
  if (val == null || val === "") return 0;
  const n = Number(val);
  return Number.isFinite(n) ? n / 1e6 : 0;
}

function isoWeekStart(isoTs) {
  const d = new Date(isoTs);
  if (Number.isNaN(d.getTime())) return null;
  const day = d.getUTCDay(); // 0=Sun..6=Sat
  const diffToMon = (day + 6) % 7;
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - diffToMon));
  return monday.toISOString().slice(0, 10);
}

function shortAddr(addr) {
  if (!addr || typeof addr !== "string") return "unknown";
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function posterLabel(task) {
  if (task.requesterDisplayName && String(task.requesterDisplayName).trim()) {
    return String(task.requesterDisplayName).trim();
  }
  return shortAddr(task.requester);
}

function computeWeeklyPosters(tasks) {
  const byWeek = new Map();
  for (const t of tasks) {
    const wk = isoWeekStart(t.createdAt);
    if (!wk) continue;
    let row = byWeek.get(wk);
    if (!row) {
      row = { week: wk, posters: new Set(), tasks: 0, rewardUsd: 0, posterCounts: new Map() };
      byWeek.set(wk, row);
    }
    const req = (t.requester || "").toLowerCase();
    if (req) {
      row.posters.add(req);
      row.posterCounts.set(req, (row.posterCounts.get(req) || 0) + 1);
    }
    row.tasks += 1;
    row.rewardUsd += atomicToUsd(t.reward);
  }
  return [...byWeek.values()]
    .sort((a, b) => a.week.localeCompare(b.week))
    .map((r) => {
      const topCount = Math.max(0, ...r.posterCounts.values());
      return {
        week: r.week,
        distinctPosters: r.posters.size,
        tasksPosted: r.tasks,
        rewardUsd: Number(r.rewardUsd.toFixed(6)),
        topPosterSharePct: r.tasks > 0 ? Number(((topCount / r.tasks) * 100).toFixed(1)) : 0,
      };
    });
}

function computeChainAnalytics(tasks) {
  const statusCounts = {};
  const modeCounts = {};
  const statusUsd = {};
  const modeUsd = {};
  const posters = new Map();
  let totalRewardUsd = 0;
  let completedRewardUsd = 0;
  let openRewardUsd = 0;
  let deadRewardUsd = 0;
  let totalSubmissions = 0;
  let zeroSubTasks = 0;
  let highSubTasks = 0;
  const subCounts = [];
  const openAgesHours = [];
  const nowMs = Date.now();

  for (const t of tasks) {
    const st = t.status || "unknown";
    const md = t.mode || "unknown";
    const usd = atomicToUsd(t.reward);
    const subs = Number(t.submissionCount || 0);

    statusCounts[st] = (statusCounts[st] || 0) + 1;
    modeCounts[md] = (modeCounts[md] || 0) + 1;
    statusUsd[st] = (statusUsd[st] || 0) + usd;
    modeUsd[md] = (modeUsd[md] || 0) + usd;

    totalRewardUsd += usd;
    if (st === "completed") completedRewardUsd += usd;
    else if (st === "open") {
      openRewardUsd += usd;
      const createdMs = Date.parse(t.createdAt);
      if (!Number.isNaN(createdMs)) openAgesHours.push((nowMs - createdMs) / 3600000);
    } else if (st === "expired" || st === "cancelled") {
      deadRewardUsd += usd;
    }

    totalSubmissions += subs;
    subCounts.push(subs);
    if (subs === 0) zeroSubTasks++;
    if (subs >= 25) highSubTasks++;

    const reqAddr = (t.requester || "unknown").toLowerCase();
    let p = posters.get(reqAddr);
    if (!p) {
      p = {
        address: t.requester || "unknown",
        label: posterLabel(t),
        actorType: t.requesterActorType || "unknown",
        tasks: 0,
        completed: 0,
        open: 0,
        dead: 0,
        rewardUsd: 0,
        completedUsd: 0,
        submissions: 0,
        modes: {},
      };
      posters.set(reqAddr, p);
    }
    p.tasks += 1;
    if (st === "completed") {
      p.completed += 1;
      p.completedUsd += usd;
    } else if (st === "open") {
      p.open += 1;
    } else if (st === "expired" || st === "cancelled") {
      p.dead += 1;
    }
    p.rewardUsd += usd;
    p.submissions += subs;
    p.modes[md] = (p.modes[md] || 0) + usd;
  }

  const sortedPostersByUsd = [...posters.values()].sort((a, b) => b.rewardUsd - a.rewardUsd);
  const sortedPostersByTasks = [...posters.values()].sort((a, b) => b.tasks - a.tasks);

  const top1TaskShare = tasks.length ? ((sortedPostersByTasks[0]?.tasks || 0) / tasks.length) * 100 : 0;
  const top3TaskShare = tasks.length
    ? (sortedPostersByTasks.slice(0, 3).reduce((s, p) => s + p.tasks, 0) / tasks.length) * 100
    : 0;
  const top10TaskShare = tasks.length
    ? (sortedPostersByTasks.slice(0, 10).reduce((s, p) => s + p.tasks, 0) / tasks.length) * 100
    : 0;
  const top3UsdShare = totalRewardUsd > 0
    ? (sortedPostersByUsd.slice(0, 3).reduce((s, p) => s + p.rewardUsd, 0) / totalRewardUsd) * 100
    : 0;
  const top10UsdShare = totalRewardUsd > 0
    ? (sortedPostersByUsd.slice(0, 10).reduce((s, p) => s + p.rewardUsd, 0) / totalRewardUsd) * 100
    : 0;

  // Herfindahl-Hirschman Index (0..10000) on task counts
  const hhiTasks = tasks.length
    ? sortedPostersByTasks.reduce((acc, p) => acc + Math.pow((p.tasks / tasks.length) * 100, 2), 0)
    : 0;

  subCounts.sort((a, b) => a - b);
  const medianSubs = subCounts.length ? subCounts[Math.floor(subCounts.length / 2)] : 0;
  const p90Subs = subCounts.length ? subCounts[Math.min(subCounts.length - 1, Math.floor(subCounts.length * 0.9))] : 0;
  const maxSubs = subCounts.length ? subCounts[subCounts.length - 1] : 0;

  openAgesHours.sort((a, b) => a - b);
  const medianOpenAgeHours = openAgesHours.length ? openAgesHours[Math.floor(openAgesHours.length / 2)] : 0;

  const expiredCount = statusCounts.expired || 0;
  const cancelledCount = statusCounts.cancelled || 0;
  const completedCount = statusCounts.completed || 0;
  const resolvedCount = completedCount + expiredCount + cancelledCount;
  const mortalityPct = resolvedCount > 0 ? ((expiredCount + cancelledCount) / resolvedCount) * 100 : 0;
  const completionRatePct = resolvedCount > 0 ? (completedCount / resolvedCount) * 100 : 0;

  // Build Capital Flow Sankey data: Top 6 posters by USD + Other -> Modes -> Outcome buckets
  const topFlowPosters = sortedPostersByUsd.slice(0, 6);
  const topFlowSet = new Set(topFlowPosters.map((p) => p.address.toLowerCase()));
  const posterToMode = new Map();
  const modeToOutcome = new Map();

  function outcomeBucket(st) {
    if (st === "completed") return "Completed";
    if (st === "open") return "Open Escrow";
    if (st === "expired") return "Expired";
    if (st === "cancelled") return "Cancelled";
    return "In Progress";
  }

  for (const t of tasks) {
    const usd = atomicToUsd(t.reward);
    if (usd <= 0) continue;
    const addr = (t.requester || "unknown").toLowerCase();
    const pName = topFlowSet.has(addr) ? posterLabel(t) : "Other posters";
    const md = t.mode || "other";
    const out = outcomeBucket(t.status);

    const k1 = `${pName}|||${md}`;
    posterToMode.set(k1, (posterToMode.get(k1) || 0) + usd);
    const k2 = `${md}|||${out}`;
    modeToOutcome.set(k2, (modeToOutcome.get(k2) || 0) + usd);
  }

  const flowLinks = {
    posterToMode: [...posterToMode.entries()]
      .map(([k, v]) => {
        const [source, target] = k.split("|||");
        return { source, target, usd: Number(v.toFixed(4)) };
      })
      .filter((x) => x.usd > 0)
      .sort((a, b) => b.usd - a.usd),
    modeToOutcome: [...modeToOutcome.entries()]
      .map(([k, v]) => {
        const [source, target] = k.split("|||");
        return { source, target, usd: Number(v.toFixed(4)) };
      })
      .filter((x) => x.usd > 0)
      .sort((a, b) => b.usd - a.usd),
  };

  // Build compact Swarm Convergence points (up to 450 most recent tasks with reward > 0 or subs > 0)
  const swarmPoints = tasks
    .filter((t) => atomicToUsd(t.reward) > 0 || (t.submissionCount || 0) > 0)
    .slice(0, 450)
    .map((t) => {
      const firstLine = String(t.description || "")
        .split(/\r?\n/)[0]
        .trim()
        .slice(0, 84);
      return {
        code: t.referenceCode || shortAddr(t.id),
        id: t.id,
        chainId: t.chainId,
        rewardUsd: Number(atomicToUsd(t.reward).toFixed(4)),
        submissions: Number(t.submissionCount || 0),
        awards: Number(t.awardCount || 0),
        status: t.status || "unknown",
        mode: t.mode || "unknown",
        poster: posterLabel(t),
        createdAt: t.createdAt,
        title: firstLine || t.referenceCode || "Untitled task",
      };
    });

  // Daily series computed directly from tasks for chain-specific views
  const dailyMap = new Map();
  for (const t of tasks) {
    const day = (t.createdAt || "").slice(0, 10);
    if (!day) continue;
    let d = dailyMap.get(day);
    if (!d) {
      d = { bucket: day, tasksCreated: 0, rewardUsd: 0, completedTasks: 0, completedUsd: 0, posters: new Set(), submissions: 0 };
      dailyMap.set(day, d);
    }
    const usd = atomicToUsd(t.reward);
    d.tasksCreated += 1;
    d.rewardUsd += usd;
    if (t.status === "completed") {
      d.completedTasks += 1;
      d.completedUsd += usd;
    }
    if (t.requester) d.posters.add(t.requester.toLowerCase());
    d.submissions += Number(t.submissionCount || 0);
  }
  const dailyTaskSeries = [...dailyMap.values()]
    .sort((a, b) => a.bucket.localeCompare(b.bucket))
    .map((d) => ({
      bucket: d.bucket,
      tasksCreated: d.tasksCreated,
      rewardUsd: Number(d.rewardUsd.toFixed(6)),
      completedTasks: d.completedTasks,
      completedUsd: Number(d.completedUsd.toFixed(6)),
      distinctPosters: d.posters.size,
      submissions: d.submissions,
    }));

  return {
    totalTasks: tasks.length,
    distinctPostersAllTime: posters.size,
    totalRewardUsd: Number(totalRewardUsd.toFixed(6)),
    completedRewardUsd: Number(completedRewardUsd.toFixed(6)),
    openRewardUsd: Number(openRewardUsd.toFixed(6)),
    deadRewardUsd: Number(deadRewardUsd.toFixed(6)),
    totalSubmissions,
    avgSubmissionsPerTask: tasks.length ? Number((totalSubmissions / tasks.length).toFixed(2)) : 0,
    medianSubmissions: medianSubs,
    p90Submissions: p90Subs,
    maxSubmissions: maxSubs,
    zeroSubTasks,
    zeroSubPct: tasks.length ? Number(((zeroSubTasks / tasks.length) * 100).toFixed(1)) : 0,
    highSubTasks,
    medianOpenAgeHours: Number(medianOpenAgeHours.toFixed(1)),
    statusCounts,
    modeCounts,
    statusUsd: Object.fromEntries(Object.entries(statusUsd).map(([k, v]) => [k, Number(v.toFixed(4))])),
    modeUsd: Object.fromEntries(Object.entries(modeUsd).map(([k, v]) => [k, Number(v.toFixed(4))])),
    concentration: {
      top1TaskSharePct: Number(top1TaskShare.toFixed(1)),
      top3TaskSharePct: Number(top3TaskShare.toFixed(1)),
      top10TaskSharePct: Number(top10TaskShare.toFixed(1)),
      top3UsdSharePct: Number(top3UsdShare.toFixed(1)),
      top10UsdSharePct: Number(top10UsdShare.toFixed(1)),
      hhiTasks: Math.round(hhiTasks),
    },
    mortality: {
      completedCount,
      expiredCount,
      cancelledCount,
      resolvedCount,
      mortalityPct: Number(mortalityPct.toFixed(1)),
      completionRatePct: Number(completionRatePct.toFixed(1)),
    },
    weeklyPosters: computeWeeklyPosters(tasks),
    topPosters: sortedPostersByUsd.slice(0, 12).map((p) => ({
      label: p.label,
      addressShort: shortAddr(p.address),
      actorType: p.actorType,
      tasks: p.tasks,
      completed: p.completed,
      open: p.open,
      dead: p.dead,
      rewardUsd: Number(p.rewardUsd.toFixed(4)),
      completedUsd: Number(p.completedUsd.toFixed(4)),
      submissions: p.submissions,
    })),
    flowLinks,
    swarmPoints,
    dailyTaskSeries,
  };
}

async function main() {
  const startedAt = new Date().toISOString();
  console.log(`[taskmarket-pulse] Refresh started at ${startedAt}`);

  // 1. Headline stats per chain
  const [statsTempo, statsBase] = await Promise.all([
    fetchJson("/api/market/stats?chainId=4217"),
    fetchJson("/api/market/stats?chainId=8453"),
  ]);

  // 2. Breakdowns per chain (also check whether API returns platform-wide totals)
  const [breakTempo, breakBase] = await Promise.all([
    fetchJson("/api/stats/breakdowns?chainId=4217"),
    fetchJson("/api/stats/breakdowns?chainId=8453"),
  ]);

  // 3. Platform time-series across all range x bucket combinations
  const timeSeries = {};
  await Promise.all(
    RANGES.flatMap((range) =>
      BUCKETS.map(async (bucket) => {
        const key = `${range}_${bucket}`;
        timeSeries[key] = await fetchJson(
          `/api/stats/platform-time-series?chainId=4217&range=${range}&bucket=${bucket}`
        );
      })
    )
  );

  // 4. Activity heatmaps (hourOfWeek & mode across ranges)
  const heatmaps = { hourOfWeek: {}, mode: {} };
  await Promise.all(
    RANGES.flatMap((range) => [
      fetchJson(`/api/stats/activity-heatmap?chainId=4217&range=${range}&dimension=hourOfWeek`).then(
        (d) => (heatmaps.hourOfWeek[range] = d)
      ),
      fetchJson(`/api/stats/activity-heatmap?chainId=4217&range=${range}&dimension=mode`).then(
        (d) => (heatmaps.mode[range] = d)
      ),
    ])
  );

  // 5. Live activity feed (up to 100 most recent events via limit=50 + cursor pagination)
  const feedItemsRaw = [];
  let feedCursor = null;
  for (let p = 0; p < 2; p++) {
    const qs = new URLSearchParams({ chainId: "4217", limit: "50" });
    if (feedCursor) qs.set("cursor", feedCursor);
    const page = await fetchJson(`/api/stats/activity-feed?${qs.toString()}`);
    if (Array.isArray(page.items)) feedItemsRaw.push(...page.items);
    if (!page.nextCursor || !page.items?.length) break;
    feedCursor = page.nextCursor;
  }
  const activityFeed = feedItemsRaw.map((item) => ({
    type: item.type,
    timestamp: item.timestamp,
    taskId: item.taskId,
    taskTitle: item.taskTitle || "",
    chainId: item.chainId,
    actorShort: shortAddr(item.actor),
    actorType: item.actorType || "unknown",
    amountUsd: item.amount != null ? Number(atomicToUsd(item.amount).toFixed(6)) : null,
    rating: item.rating ?? null,
  }));

  // 6. Full paginated task list for BOTH chains
  const [tempoRes, baseRes] = await Promise.all([fetchAllTasks(4217), fetchAllTasks(8453)]);
  const allTasks = [...tempoRes.tasks, ...baseRes.tasks].sort((a, b) =>
    String(b.createdAt || "").localeCompare(String(a.createdAt || ""))
  );

  const fetchedAtUtc = new Date().toISOString();

  // Verify API scoping empirically so the UI and Methods note state exact truth
  const breakdownsIdenticalAcrossChains = JSON.stringify(breakTempo) === JSON.stringify(breakBase);

  const snapshot = {
    schemaVersion: "1.0.0",
    fetchedAtUtc,
    cacheTtlSeconds: 300,
    refreshCadence: "Every 30 minutes via scheduled GitHub Actions build (plus on-demand server cache)",
    apiBaseUrl: BASE_URL,
    endpointsUsed: [
      "/api/market/stats?chainId=4217",
      "/api/market/stats?chainId=8453",
      "/api/stats/breakdowns?chainId=4217",
      "/api/stats/breakdowns?chainId=8453",
      "/api/stats/platform-time-series?chainId=4217&range={7d|30d|90d|all}&bucket={day|week}",
      "/api/stats/activity-heatmap?chainId=4217&range={7d|30d|90d|all}&dimension={hourOfWeek|mode}",
      "/api/stats/activity-feed?chainId=4217&limit=50&cursor=…",
      "/api/tasks?chainId=4217&sort=newest&limit=100&cursor=…",
      "/api/tasks?chainId=8453&sort=newest&limit=100&cursor=…",
    ],
    apiNotes: {
      breakdownsIdenticalAcrossChains,
      pagination: {
        tempoTasksFetched: tempoRes.tasks.length,
        tempoPagesFetched: tempoRes.pages,
        baseTasksFetched: baseRes.tasks.length,
        basePagesFetched: baseRes.pages,
      },
    },
    marketStats: {
      tempo: statsTempo,
      base: statsBase,
    },
    breakdowns: {
      platform: breakTempo,
      tempoRaw: breakTempo,
      baseRaw: breakBase,
    },
    timeSeries,
    heatmaps,
    activityFeed,
    analytics: {
      combined: computeChainAnalytics(allTasks),
      tempo: computeChainAnalytics(tempoRes.tasks),
      base: computeChainAnalytics(baseRes.tasks),
    },
  };

  const outDir = path.join(ROOT, "public", "data");
  await fs.mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, "snapshot.json");
  await fs.writeFile(outPath, JSON.stringify(snapshot, null, 2) + "\n", "utf8");

  console.log(
    `[taskmarket-pulse] Saved snapshot.json (${fetchedAtUtc}) | Tempo tasks=${tempoRes.tasks.length} (${tempoRes.pages} pages) | Base tasks=${baseRes.tasks.length} (${baseRes.pages} pages) | Feed=${activityFeed.length}`
  );
  console.log(
    `[taskmarket-pulse] Combined: distinctPosters=${snapshot.analytics.combined.distinctPostersAllTime}, totalReward=$${snapshot.analytics.combined.totalRewardUsd.toFixed(2)}, mortality=${snapshot.analytics.combined.mortality.mortalityPct}%, top3PosterTaskShare=${snapshot.analytics.combined.concentration.top3TaskSharePct}%`
  );
  return snapshot;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

export { main as refreshSnapshot };
