import { downloadViewShareCard } from "./share-card.js";

const STATE = {
  snap: null,
  chain: "combined", // combined | tempo | base
  tsRange: "30d",
  tsBucket: "day",
  hmDim: "hourOfWeek", // hourOfWeek | mode
  hmRange: "30d",
  swarmStatus: "all",
  feedType: "all",
  flowFocus: null, // { col, name }
  selectedTaskId: null,
};

const CHAIN_META = {
  combined: { label: "Combined", asset: "USD eq.", note: "Tempo OUSD + Base USDC" },
  tempo: { label: "Tempo (4217)", asset: "OUSD", note: "chainId 4217 · OUSD" },
  base: { label: "Base (8453)", asset: "USDC", note: "chainId 8453 · USDC" },
};

const DAYS_UTC = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function esc(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function fmtInt(n) {
  return Number(n || 0).toLocaleString("en-US");
}

function fmtUsd(n, digits = 2) {
  const v = Number(n || 0);
  return "$" + v.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function fmtCompactUsd(n) {
  const v = Number(n || 0);
  if (v >= 1000) return "$" + (v / 1000).toFixed(2) + "k";
  return fmtUsd(v, v >= 100 ? 0 : 2);
}

function fmtUtcShort(iso) {
  if (!iso) return "—";
  return String(iso).replace("T", " ").slice(0, 16) + " UTC";
}

function showToast(msg) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => {
    el.hidden = true;
  }, 2400);
}

function parseHashState() {
  const raw = window.location.hash.replace(/^#/, "");
  if (!raw) return;
  const [section, query] = raw.split("?");
  if (query) {
    const p = new URLSearchParams(query);
    if (["combined", "tempo", "base"].includes(p.get("chain"))) STATE.chain = p.get("chain");
    if (["7d", "30d", "90d", "all"].includes(p.get("range"))) {
      STATE.tsRange = p.get("range");
      STATE.hmRange = p.get("range");
    }
    if (["day", "week"].includes(p.get("bucket"))) STATE.tsBucket = p.get("bucket");
    if (["hourOfWeek", "mode"].includes(p.get("dim"))) STATE.hmDim = p.get("dim");
  }
  if (section) {
    requestAnimationFrame(() => {
      const target = document.getElementById(section);
      if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }
}

function buildDeepLink(section) {
  const params = new URLSearchParams({
    chain: STATE.chain,
    range: STATE.tsRange,
    bucket: STATE.tsBucket,
  });
  return `${window.location.origin}${window.location.pathname}#${section}?${params.toString()}`;
}

function syncActiveButtons() {
  document.querySelectorAll("#chain-switch button").forEach((b) => {
    const on = b.dataset.chain === STATE.chain;
    b.classList.toggle("active", on);
    b.setAttribute("aria-selected", on ? "true" : "false");
  });
  document.querySelectorAll("#ts-range button").forEach((b) => b.classList.toggle("active", b.dataset.range === STATE.tsRange));
  document.querySelectorAll("#ts-bucket button").forEach((b) => b.classList.toggle("active", b.dataset.bucket === STATE.tsBucket));
  document.querySelectorAll("#hm-dim button").forEach((b) => b.classList.toggle("active", b.dataset.dim === STATE.hmDim));
  document.querySelectorAll("#hm-range button").forEach((b) => b.classList.toggle("active", b.dataset.range === STATE.hmRange));
  document.querySelectorAll("#swarm-status-filter button").forEach((b) => b.classList.toggle("active", b.dataset.status === STATE.swarmStatus));
  document.querySelectorAll("#feed-type button").forEach((b) => b.classList.toggle("active", b.dataset.type === STATE.feedType));
}

function activeAnalytics() {
  return STATE.snap.analytics[STATE.chain];
}

/* 1. Headline KPIs + Dual-Chain Strip + Insights */
function renderHero() {
  const snap = STATE.snap;
  const a = activeAnalytics();
  const msT = snap.marketStats.tempo;
  const msB = snap.marketStats.base;
  const meta = CHAIN_META[STATE.chain];

  document.getElementById("asof-text").textContent = `Data as of ${fmtUtcShort(snap.fetchedAtUtc)}`;

  const paidWorkersVal =
    STATE.chain === "tempo"
      ? fmtInt(msT.paidWorkers)
      : STATE.chain === "base"
      ? fmtInt(msB.paidWorkers)
      : `${fmtInt(msT.paidWorkers)} / ${fmtInt(msB.paidWorkers)}`;

  const paidWorkersSub =
    STATE.chain === "combined"
      ? "Tempo / Base paid workers (per-chain)"
      : `${meta.label} paid workers`;

  const activeWalletsVal =
    STATE.chain === "tempo"
      ? fmtInt(msT.activeWallets)
      : STATE.chain === "base"
      ? fmtInt(msB.activeWallets)
      : `${fmtInt(msT.activeWallets)} / ${fmtInt(msB.activeWallets)}`;

  const activeWalletsSub =
    STATE.chain === "combined"
      ? "Tempo / Base active wallets (API)"
      : `${meta.label} active wallets`;

  const openCount = STATE.chain === "combined" ? msT.openTasks : a.statusCounts.open || 0;
  const openSub =
    STATE.chain === "combined"
      ? `API headline open (${fmtInt(a.statusCounts.open || 0)} public indexed)`
      : `${fmtCompactUsd(a.openRewardUsd)} held in public escrow`;

  const kpis = [
    {
      label: "Active Agents (7d)",
      value: fmtInt(msT.activeAgents7d),
      sub: `${fmtInt(msT.activeWorkers7d)} active workers · ${fmtInt(msT.registeredWorkers)} registered`,
    },
    {
      label: "Open Tasks",
      value: fmtInt(openCount),
      sub: openSub,
    },
    {
      label: `Public Escrow (${meta.asset})`,
      value: fmtUsd(a.totalRewardUsd, 2),
      sub: `${fmtInt(a.totalTasks)} public tasks · ${fmtUsd(a.completedRewardUsd, 2)} completed`,
    },
    {
      label: "Distinct Posters",
      value: fmtInt(a.distinctPostersAllTime),
      sub: `Latest week: ${a.weeklyPosters.at(-1)?.distinctPosters ?? 0} posters`,
    },
    {
      label: "Paid Workers",
      value: paidWorkersVal,
      sub: paidWorkersSub,
    },
    {
      label: "Active Wallets",
      value: activeWalletsVal,
      sub: activeWalletsSub,
    },
  ];

  document.getElementById("kpi-grid").innerHTML = kpis
    .map(
      (k) => `
      <div class="kpi-card">
        <span class="kpi-label">${esc(k.label)}</span>
        <strong class="kpi-value">${esc(k.value)}</strong>
        <span class="kpi-sub">${esc(k.sub)}</span>
      </div>`
    )
    .join("");

  const tA = snap.analytics.tempo;
  const bA = snap.analytics.base;
  document.getElementById("chain-strip").innerHTML = `
    <div class="chain-box">
      <div class="chain-box-head">
        <span class="chain-badge"><span class="dot-tempo"></span>TEMPO · CHAIN 4217 · OUSD</span>
        <span class="mono" style="font-size:11px;color:var(--muted)">${tA.mortality.completionRatePct}% resolved completed</span>
      </div>
      <div class="chain-stats-row">
        <div><span class="chain-stat-k">Public tasks</span><span class="chain-stat-v">${fmtInt(tA.totalTasks)}</span></div>
        <div><span class="chain-stat-k">Escrow volume</span><span class="chain-stat-v">${fmtCompactUsd(tA.totalRewardUsd)}</span></div>
        <div><span class="chain-stat-k">Paid workers</span><span class="chain-stat-v">${fmtInt(msT.paidWorkers)}</span></div>
        <div><span class="chain-stat-k">Expired/Cancel</span><span class="chain-stat-v">${tA.mortality.mortalityPct}%</span></div>
      </div>
    </div>
    <div class="chain-box">
      <div class="chain-box-head">
        <span class="chain-badge"><span class="dot-base"></span>BASE · CHAIN 8453 · USDC</span>
        <span class="mono" style="font-size:11px;color:var(--muted)">${bA.mortality.completionRatePct}% resolved completed</span>
      </div>
      <div class="chain-stats-row">
        <div><span class="chain-stat-k">Public tasks</span><span class="chain-stat-v">${fmtInt(bA.totalTasks)}</span></div>
        <div><span class="chain-stat-k">Escrow volume</span><span class="chain-stat-v">${fmtCompactUsd(bA.totalRewardUsd)}</span></div>
        <div><span class="chain-stat-k">Paid workers</span><span class="chain-stat-v">${fmtInt(msB.paidWorkers)}</span></div>
        <div><span class="chain-stat-k">Expired/Cancel</span><span class="chain-stat-v">${bA.mortality.mortalityPct}%</span></div>
      </div>
    </div>
  `;

  // Compute 4 non-obvious data-driven insights strictly from snapshot
  const latestWk = a.weeklyPosters.at(-1);
  const peakWk = [...a.weeklyPosters].sort((x, y) => y.distinctPosters - x.distinctPosters)[0];
  const mortalityGap = Math.abs(bA.mortality.mortalityPct - tA.mortality.mortalityPct).toFixed(1);

  const insights = [
    {
      tag: "Poster Concentration",
      headline: `Top 3 posters account for ${a.concentration.top3TaskSharePct}% of tasks`,
      body: `Across ${fmtInt(a.distinctPostersAllTime)} distinct requesters, the top 10 hold ${a.concentration.top10UsdSharePct}% of public escrowed rewards (HHI ${fmtInt(a.concentration.hhiTasks)}).`,
    },
    {
      tag: "Task Mortality Gap",
      headline: `Base tasks die at ${bA.mortality.mortalityPct}% vs ${tA.mortality.mortalityPct}% on Tempo`,
      body: `A ${mortalityGap} percentage-point spread in resolved tasks ending expired or cancelled (${fmtInt(bA.mortality.expiredCount + bA.mortality.cancelledCount)} dead on Base vs ${fmtInt(tA.mortality.expiredCount + tA.mortality.cancelledCount)} on Tempo).`,
    },
    {
      tag: "Swarm Attention Skew",
      headline: `Median ${a.medianSubmissions} submissions, but P90 jumps to ${a.p90Submissions}`,
      body: `${a.zeroSubPct}% of public tasks (${fmtInt(a.zeroSubTasks)}) have zero submissions, while ${fmtInt(a.highSubTasks)} tasks attracted 25+ competing entries (max ${fmtInt(a.maxSubmissions)}).`,
    },
    {
      tag: "Weekly Poster Breadth",
      headline: peakWk ? `Peak week hit ${peakWk.distinctPosters} distinct posters (${peakWk.week})` : "Weekly poster cadence",
      body: latestWk
        ? `Current week (${latestWk.week}) has ${latestWk.distinctPosters} distinct posters across ${latestWk.tasksPosted} tasks, with the largest poster at ${latestWk.topPosterSharePct}% share.`
        : "Computed directly from paginated public task creation timestamps.",
    },
  ];

  document.getElementById("insights-grid").innerHTML = insights
    .map(
      (ins) => `
      <article class="insight-card">
        <p class="insight-tag">${esc(ins.tag)}</p>
        <h3 class="insight-headline">${esc(ins.headline)}</h3>
        <p class="insight-body">${esc(ins.body)}</p>
      </article>`
    )
    .join("");
}

/* 2. Original View 1: Escrow Capital Flow Ribbon (Custom Interactive SVG Sankey) */
function renderFlow() {
  const a = activeAnalytics();
  const { posterToMode, modeToOutcome } = a.flowLinks;
  const resetBtn = document.getElementById("flow-reset");
  resetBtn.hidden = !STATE.flowFocus;

  const W = 980;
  const H = 450;
  const padY = 44;
  const usableH = H - padY * 2;
  const nodeW = 14;
  const xCols = [190, 490, 790];

  // Aggregate totals per column
  const col0 = new Map();
  const col1 = new Map();
  const col2 = new Map();
  for (const l of posterToMode) {
    col0.set(l.source, (col0.get(l.source) || 0) + l.usd);
    col1.set(l.target, (col1.get(l.target) || 0) + l.usd);
  }
  for (const l of modeToOutcome) {
    col2.set(l.target, (col2.get(l.target) || 0) + l.usd);
  }

  function layoutColumn(map, x, sortSpecial = null) {
    const entries = [...map.entries()].sort((a1, b1) => {
      if (sortSpecial) return sortSpecial(a1[0]) - sortSpecial(b1[0]);
      if (a1[0] === "Other posters") return 1;
      if (b1[0] === "Other posters") return -1;
      return b1[1] - a1[1];
    });
    const total = entries.reduce((s, e) => s + e[1], 0) || 1;
    const gap = 14;
    const minH = 22;
    const totalGap = gap * Math.max(0, entries.length - 1);
    const rawHeights = entries.map(([, val]) => Math.max(minH, (val / total) * (usableH - totalGap)));
    const rawSum = rawHeights.reduce((s, h) => s + h, 0) || 1;
    const fit = rawSum > usableH - totalGap ? (usableH - totalGap) / rawSum : 1;
    let y = padY;
    const nodes = new Map();
    entries.forEach(([name, val], idx) => {
      const h = Math.max(14, rawHeights[idx] * fit);
      nodes.set(name, { name, val, x, y, h, outY: y, inY: y });
      y += h + gap;
    });
    return { nodes, total };
  }

  const outcomeOrder = (k) => ({ Completed: 0, "Open Escrow": 1, "In Progress": 2, Expired: 3, Cancelled: 4 }[k] ?? 5);
  const L0 = layoutColumn(col0, xCols[0]);
  const L1 = layoutColumn(col1, xCols[1]);
  const L2 = layoutColumn(col2, xCols[2], outcomeOrder);

  const outcomeColor = (name) => {
    if (name === "Completed") return "#EFE9E2";
    if (name === "Open Escrow") return "#E74079";
    if (name === "In Progress") return "#D9A097";
    return "#5B534B";
  };

  function isLinkActive(colA, src, colB, dst) {
    if (!STATE.flowFocus) return true;
    const f = STATE.flowFocus;
    if (f.col === colA && f.name === src) return true;
    if (f.col === colB && f.name === dst) return true;
    return false;
  }

  function ribbonPath(x0, y0, h0, x1, y1, h1) {
    const mx = (x0 + x1) / 2;
    return `M${x0},${y0} C${mx},${y0} ${mx},${y1} ${x1},${y1} L${x1},${y1 + h1} C${mx},${y1 + h1} ${mx},${y0 + h0} ${x0},${y0 + h0} Z`;
  }

  let pathsHtml = "";
  for (const l of posterToMode) {
    const s = L0.nodes.get(l.source);
    const t = L1.nodes.get(l.target);
    if (!s || !t) continue;
    const h0 = Math.max(1.5, (l.usd / s.val) * s.h);
    const h1 = Math.max(1.5, (l.usd / t.val) * t.h);
    const active = isLinkActive(0, l.source, 1, l.target);
    const op = STATE.flowFocus ? (active ? 0.58 : 0.06) : 0.28;
    const fill = l.target === "bounty" ? "#D9A097" : "#8F857B";
    pathsHtml += `<path d="${ribbonPath(s.x + nodeW, s.outY, h0, t.x, t.inY, h1)}" fill="${fill}" fill-opacity="${op}">
      <title>${esc(l.source)} → ${esc(l.target)}: ${fmtUsd(l.usd)}</title>
    </path>`;
    s.outY += h0;
    t.inY += h1;
  }

  for (const l of modeToOutcome) {
    const s = L1.nodes.get(l.source);
    const t = L2.nodes.get(l.target);
    if (!s || !t) continue;
    const h0 = Math.max(1.5, (l.usd / s.val) * s.h);
    const h1 = Math.max(1.5, (l.usd / t.val) * t.h);
    const active = isLinkActive(1, l.source, 2, l.target);
    const op = STATE.flowFocus ? (active ? 0.68 : 0.06) : 0.34;
    const fill = outcomeColor(l.target);
    pathsHtml += `<path d="${ribbonPath(s.x + nodeW, s.outY, h0, t.x, t.inY, h1)}" fill="${fill}" fill-opacity="${op}">
      <title>${esc(l.source)} → ${esc(l.target)}: ${fmtUsd(l.usd)}</title>
    </path>`;
    s.outY += h0;
    t.inY += h1;
  }

  let nodesHtml = "";
  const drawColNodes = (colIdx, nodesMap, align, colorFn) => {
    for (const n of nodesMap.values()) {
      const focused = STATE.flowFocus && STATE.flowFocus.col === colIdx && STATE.flowFocus.name === n.name;
      const fill = colorFn(n.name);
      const labelX = align === "left" ? n.x - 10 : align === "right" ? n.x + nodeW + 10 : n.x + nodeW / 2;
      const anchor = align === "left" ? "end" : align === "right" ? "start" : "middle";
      const labelY = n.y + n.h / 2 - (align === "mid" ? -4 : 1);
      const shortName = n.name.length > 20 ? n.name.slice(0, 19) + "…" : n.name;
      const midPill =
        align === "mid"
          ? `<rect x="${(labelX - (shortName.length * 3.8 + 10)).toFixed(1)}" y="${(n.y + n.h / 2 - 10).toFixed(1)}" width="${(shortName.length * 7.6 + 20).toFixed(1)}" height="19" rx="5" fill="#12100E" fill-opacity="0.88" stroke="#453E37" stroke-width="0.7" />`
          : "";
      nodesHtml += `
        <g class="svg-node" data-flow-col="${colIdx}" data-flow-name="${esc(n.name)}">
          <rect x="${n.x}" y="${n.y}" width="${nodeW}" height="${n.h}" rx="3" fill="${fill}" stroke="${focused ? "#FFF6E8" : "#12100E"}" stroke-width="${focused ? 1.5 : 0.8}" />
          ${midPill}
          <text x="${labelX}" y="${labelY}" text-anchor="${anchor}" fill="#EFE9E2" font-family="Inter Tight, sans-serif" font-size="11.5" font-weight="600">${esc(shortName)}</text>
          ${align !== "mid" ? `<text x="${labelX}" y="${labelY + 13}" text-anchor="${anchor}" fill="#B0A79D" font-family="Departure Mono, monospace" font-size="10">${fmtCompactUsd(n.val)}</text>` : ""}
        </g>`;
    }
  };

  drawColNodes(0, L0.nodes, "left", (name) => (name === "Other posters" ? "#6F665D" : "#D9A097"));
  drawColNodes(1, L1.nodes, "mid", () => "#B0A79D");
  drawColNodes(2, L2.nodes, "right", outcomeColor);

  const svg = `
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Escrow capital flow from posters through modes to outcomes">
      <text x="${xCols[0] + nodeW}" y="14" text-anchor="end" fill="#B0A79D" font-family="Departure Mono, monospace" font-size="10.5">TOP POSTERS</text>
      <text x="${xCols[1] + nodeW / 2}" y="14" text-anchor="middle" fill="#B0A79D" font-family="Departure Mono, monospace" font-size="10.5">TASK MODES</text>
      <text x="${xCols[2]}" y="14" text-anchor="start" fill="#B0A79D" font-family="Departure Mono, monospace" font-size="10.5">OUTCOMES</text>
      ${pathsHtml}
      ${nodesHtml}
    </svg>`;

  const wrap = document.getElementById("flow-viz");
  wrap.innerHTML = svg;
  wrap.querySelectorAll("[data-flow-col]").forEach((g) => {
    g.addEventListener("click", () => {
      const col = Number(g.dataset.flowCol);
      const name = g.dataset.flowName;
      if (STATE.flowFocus && STATE.flowFocus.col === col && STATE.flowFocus.name === name) {
        STATE.flowFocus = null;
      } else {
        STATE.flowFocus = { col, name };
      }
      renderFlow();
    });
  });

  document.getElementById("flow-footnote").innerHTML = `
    <span>Scope: <strong>${esc(CHAIN_META[STATE.chain].label)}</strong> · ${fmtInt(a.totalTasks)} public tasks totaling <code>${fmtUsd(a.totalRewardUsd)}</code></span>
    <span>${STATE.flowFocus ? `Focused on <code>${esc(STATE.flowFocus.name)}</code> (click again to clear)` : "Click any poster, mode, or outcome bar to isolate its flow."}</span>
  `;
}

/* 3. Original View 2: Swarm Convergence Map */
function renderSwarm() {
  const a = activeAnalytics();
  const points = a.swarmPoints.filter((p) => {
    if (STATE.swarmStatus === "all") return true;
    if (STATE.swarmStatus === "dead") return p.status === "expired" || p.status === "cancelled";
    return p.status === STATE.swarmStatus;
  });

  const W = 680;
  const H = 370;
  const pad = { t: 24, r: 22, b: 46, l: 58 };
  const pw = W - pad.l - pad.r;
  const ph = H - pad.t - pad.b;

  const maxReward = Math.max(10, ...points.map((p) => p.rewardUsd));
  const maxSubs = Math.max(10, ...points.map((p) => p.submissions));

  // Log10(x + 0.05) scale for rewards so $0.10, $1, $10, $100 read cleanly
  const minLogR = Math.log10(0.05);
  const maxLogR = Math.log10(maxReward * 1.25);
  const scaleX = (r) => pad.l + ((Math.log10(Math.max(0.05, r)) - minLogR) / (maxLogR - minLogR)) * pw;
  // Sqrt scale for submissions so 0..100+ separates clearly without crushing low-sub tasks
  const scaleY = (s) => pad.t + ph - (Math.sqrt(Math.max(0, s)) / Math.sqrt(maxSubs * 1.08)) * ph;

  const xTicks = [0.1, 0.5, 1, 5, 10, 50, 100].filter((v) => v <= maxReward * 1.25);
  const yTicks = [0, 5, 15, 35, 65, 100].filter((v) => v <= maxSubs * 1.15);

  const gridHtml = [
    ...xTicks.map((v) => {
      const x = scaleX(v);
      return `<line x1="${x}" y1="${pad.t}" x2="${x}" y2="${pad.t + ph}" stroke="#2F2A25" stroke-dasharray="2 3" />
              <text x="${x}" y="${pad.t + ph + 18}" text-anchor="middle" fill="#B0A79D" font-family="Departure Mono, monospace" font-size="10">$${v}</text>`;
    }),
    ...yTicks.map((v) => {
      const y = scaleY(v);
      return `<line x1="${pad.l}" y1="${y}" x2="${pad.l + pw}" y2="${y}" stroke="#2F2A25" stroke-dasharray="2 3" />
              <text x="${pad.l - 8}" y="${y + 4}" text-anchor="end" fill="#B0A79D" font-family="Departure Mono, monospace" font-size="10">${v}</text>`;
    }),
  ].join("");

  const colorFor = (st) => {
    if (st === "open") return "#E74079";
    if (st === "completed") return "#EFE9E2";
    if (st === "expired" || st === "cancelled") return "#6A6158";
    return "#D9A097";
  };

  const dotsHtml = points
    .map((p, idx) => {
      const cx = scaleX(p.rewardUsd);
      const cy = scaleY(p.submissions);
      const r = Math.min(9.5, 3.6 + Math.sqrt(p.awards || 0) * 1.4);
      const sel = STATE.selectedTaskId === p.id;
      const fill = colorFor(p.status);
      return `<circle class="svg-dot" data-swarm-idx="${idx}" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${sel ? r + 2.5 : r.toFixed(1)}"
        fill="${fill}" fill-opacity="${sel ? 0.98 : p.status === "open" ? 0.85 : 0.52}"
        stroke="${sel ? "#FFF6E8" : "#12100E"}" stroke-width="${sel ? 1.8 : 0.7}">
        <title>${esc(p.code)} · ${fmtUsd(p.rewardUsd)} · ${p.submissions} subs · ${p.status}</title>
      </circle>`;
    })
    .join("");

  const wrap = document.getElementById("swarm-viz");
  wrap.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Swarm convergence scatter plot of reward versus submissions">
      ${gridHtml}
      <line x1="${pad.l}" y1="${pad.t + ph}" x2="${pad.l + pw}" y2="${pad.t + ph}" stroke="#453E37" />
      <line x1="${pad.l}" y1="${pad.t}" x2="${pad.l}" y2="${pad.t + ph}" stroke="#453E37" />
      <text x="${pad.l + pw / 2}" y="${H - 6}" text-anchor="middle" fill="#B0A79D" font-family="Departure Mono, monospace" font-size="10.5">ESCROWED REWARD (LOG SCALE, USD EQ.)</text>
      <text x="14" y="${pad.t + ph / 2}" text-anchor="middle" fill="#B0A79D" font-family="Departure Mono, monospace" font-size="10.5" transform="rotate(-90 14 ${pad.t + ph / 2})">SUBMISSIONS</text>
      <g font-family="Departure Mono, monospace" font-size="10">
        <circle cx="${pad.l + 10}" cy="12" r="4" fill="#E74079" /><text x="${pad.l + 19}" y="15" fill="#EFE9E2">Open</text>
        <circle cx="${pad.l + 70}" cy="12" r="4" fill="#EFE9E2" /><text x="${pad.l + 79}" y="15" fill="#EFE9E2">Completed</text>
        <circle cx="${pad.l + 162}" cy="12" r="4" fill="#6A6158" /><text x="${pad.l + 171}" y="15" fill="#B0A79D">Expired/Cancelled</text>
      </g>
      ${dotsHtml}
    </svg>
  `;

  function showInspector(p) {
    if (!p) return;
    STATE.selectedTaskId = p.id;
    const perSub = p.submissions > 0 ? fmtUsd(p.rewardUsd / p.submissions, 3) : "Uncontested";
    const chainTag = p.chainId === 4217 ? "Tempo (4217 · OUSD)" : "Base (8453 · USDC)";
    document.getElementById("swarm-inspector").innerHTML = `
      <p class="inspector-kicker">${esc(p.code)} · ${esc(p.status.toUpperCase())}</p>
      <h3 class="inspector-title">${esc(p.title)}</h3>
      <div class="inspector-meta">
        <div class="inspector-kv"><span>Reward</span><strong>${fmtUsd(p.rewardUsd)}</strong></div>
        <div class="inspector-kv"><span>Submissions</span><strong>${fmtInt(p.submissions)}</strong></div>
        <div class="inspector-kv"><span>Reward / Entry</span><strong>${esc(perSub)}</strong></div>
        <div class="inspector-kv"><span>Mode</span><strong>${esc(p.mode)}</strong></div>
        <div class="inspector-kv"><span>Poster</span><strong>${esc(p.poster.slice(0, 18))}</strong></div>
        <div class="inspector-kv"><span>Chain</span><strong>${esc(p.chainId === 4217 ? "Tempo" : "Base")}</strong></div>
      </div>
      <p class="kpi-sub" style="margin:2px 0 0">Posted ${esc(fmtUtcShort(p.createdAt))} · ${esc(chainTag)}</p>
      <a class="btn-ghost btn-sm" href="https://taskmarket.dev/tasks/${encodeURIComponent(p.id)}" target="_blank" rel="noopener">Open on taskmarket.dev →</a>
    `;
  }

  wrap.querySelectorAll("[data-swarm-idx]").forEach((dot) => {
    const idx = Number(dot.dataset.swarmIdx);
    const pt = points[idx];
    dot.addEventListener("mouseenter", () => showInspector(pt));
    dot.addEventListener("click", () => {
      showInspector(pt);
      renderSwarm();
    });
  });

  // Pre-select the highest-reward open task (or highest-submission task) on first load
  if (!STATE.selectedTaskId && points.length) {
    const featured =
      points.filter((p) => p.status === "open").sort((x, y) => y.rewardUsd - x.rewardUsd)[0] || points[0];
    showInspector(featured);
  }
}

/* 4. Platform Time-Series 2x2 Charts */
function miniSparkChart(rows, valueFn, { color = "#D9A097", formatVal = fmtInt, isBar = false }) {
  const W = 460;
  const H = 165;
  const pad = { t: 12, r: 10, b: 28, l: 46 };
  const pw = W - pad.l - pad.r;
  const ph = H - pad.t - pad.b;

  const vals = rows.map(valueFn);
  const maxV = Math.max(1, ...vals);
  const stepX = rows.length > 1 ? pw / (rows.length - 1) : pw;

  const yTicks = [0, formatVal === fmtInt ? Math.round(maxV / 2) : maxV / 2, maxV];
  const yGrid = yTicks
    .map((v) => {
      const y = pad.t + ph - (v / maxV) * ph;
      return `<line x1="${pad.l}" y1="${y.toFixed(1)}" x2="${pad.l + pw}" y2="${y.toFixed(1)}" stroke="#2F2A25" />
              <text x="${pad.l - 6}" y="${(y + 3.5).toFixed(1)}" text-anchor="end" fill="#B0A79D" font-family="Departure Mono, monospace" font-size="9.5">${esc(formatVal(v))}</text>`;
    })
    .join("");

  let geom = "";
  if (isBar) {
    const bw = Math.max(2, Math.min(18, (pw / Math.max(1, rows.length)) * 0.72));
    geom = rows
      .map((r, i) => {
        const v = vals[i];
        const x = pad.l + (rows.length > 1 ? (i / (rows.length - 1)) * (pw - bw) : (pw - bw) / 2);
        const h = (v / maxV) * ph;
        const y = pad.t + ph - h;
        return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(1, h).toFixed(1)}" rx="1.5" fill="${color}" fill-opacity="0.85">
          <title>${esc(r.bucket)}: ${esc(formatVal(v))}</title>
        </rect>`;
      })
      .join("");
  } else {
    const pts = rows.map((r, i) => {
      const x = pad.l + (rows.length > 1 ? i * stepX : pw / 2);
      const y = pad.t + ph - (vals[i] / maxV) * ph;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    const area = `${pad.l},${pad.t + ph} ${pts.join(" ")} ${pad.l + pw},${pad.t + ph}`;
    geom = `<polygon points="${area}" fill="${color}" fill-opacity="0.14" />
            <polyline points="${pts.join(" ")}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" />` +
      rows
        .map((r, i) => {
          const [x, y] = pts[i].split(",");
          return `<circle cx="${x}" cy="${y}" r="2.6" fill="${color}"><title>${esc(r.bucket)}: ${esc(formatVal(vals[i]))}</title></circle>`;
        })
        .join("");
  }

  const firstLbl = rows[0]?.bucket?.slice(5) || "";
  const midLbl = rows[Math.floor(rows.length / 2)]?.bucket?.slice(5) || "";
  const lastLbl = rows.at(-1)?.bucket?.slice(5) || "";

  return `<svg viewBox="0 0 ${W} ${H}">
    ${yGrid}
    ${geom}
    <text x="${pad.l}" y="${H - 6}" fill="#B0A79D" font-family="Departure Mono, monospace" font-size="9.5">${esc(firstLbl)}</text>
    <text x="${pad.l + pw / 2}" y="${H - 6}" text-anchor="middle" fill="#B0A79D" font-family="Departure Mono, monospace" font-size="9.5">${esc(midLbl)}</text>
    <text x="${pad.l + pw}" y="${H - 6}" text-anchor="end" fill="#B0A79D" font-family="Departure Mono, monospace" font-size="9.5">${esc(lastLbl)}</text>
  </svg>`;
}

function renderTimeSeries() {
  const key = `${STATE.tsRange}_${STATE.tsBucket}`;
  const rawRows = STATE.snap.timeSeries[key] || [];
  // Trim leading all-zero rows for "all" range so active era is readable
  let rows = rawRows;
  if (STATE.tsRange === "all") {
    const firstNonZero = rawRows.findIndex((r) => (r.tasksCreated || 0) > 0 || (r.activeAgents || 0) > 0);
    if (firstNonZero > 0) rows = rawRows.slice(firstNonZero);
  }

  const sumTasks = rows.reduce((s, r) => s + Number(r.tasksCreated || 0), 0);
  const sumPutUp = rows.reduce((s, r) => s + Number(r.rewardVolume || 0) / 1e6, 0);
  const sumPaid = rows.reduce((s, r) => s + Number(r.paidVolume || 0) / 1e6, 0);
  const peakAgents = Math.max(0, ...rows.map((r) => Number(r.activeAgents || 0)));

  const charts = [
    {
      title: `${STATE.tsBucket === "day" ? "Daily" : "Weekly"} Active Agents`,
      total: `Peak ${fmtInt(peakAgents)}`,
      svg: miniSparkChart(rows, (r) => Number(r.activeAgents || 0), { color: "#E74079", formatVal: fmtInt }),
    },
    {
      title: `Tasks Posted (${STATE.tsRange})`,
      total: fmtInt(sumTasks),
      svg: miniSparkChart(rows, (r) => Number(r.tasksCreated || 0), { color: "#EFE9E2", formatVal: fmtInt, isBar: true }),
    },
    {
      title: `Rewards Put Up in Escrow (${STATE.tsRange})`,
      total: fmtUsd(sumPutUp, 2),
      svg: miniSparkChart(rows, (r) => Number(r.rewardVolume || 0) / 1e6, { color: "#D9A097", formatVal: fmtCompactUsd, isBar: true }),
    },
    {
      title: `Rewards Paid Out (${STATE.tsRange})`,
      total: fmtUsd(sumPaid, 2),
      svg: miniSparkChart(rows, (r) => Number(r.paidVolume || 0) / 1e6, { color: "#FFF6E8", formatVal: fmtCompactUsd }),
    },
  ];

  document.getElementById("ts-charts").innerHTML = charts
    .map(
      (c) => `
      <div class="ts-mini-card">
        <div class="ts-mini-head">
          <span class="ts-mini-title">${esc(c.title)}</span>
          <span class="ts-mini-total">${esc(c.total)}</span>
        </div>
        <div class="viz-wrap">${c.svg}</div>
      </div>`
    )
    .join("");

  document.getElementById("ts-footnote").innerHTML = `
    <span>Source: <code>/api/stats/platform-time-series?range=${esc(STATE.tsRange)}&amp;bucket=${esc(STATE.tsBucket)}</code> (platform aggregate across Tempo &amp; Base)</span>
    <span>Buckets displayed: ${rows.length}</span>
  `;
}

/* 5. Distinct Task Posters Per Week + Top Posters Table */
function renderPosters() {
  const a = activeAnalytics();
  const weeks = a.weeklyPosters;
  const W = 560;
  const H = 305;
  const pad = { t: 40, r: 44, b: 44, l: 44 };
  const pw = W - pad.l - pad.r;
  const ph = H - pad.t - pad.b;

  const maxP = Math.max(5, ...weeks.map((w) => w.distinctPosters));
  const maxT = Math.max(10, ...weeks.map((w) => w.tasksPosted));
  const bw = Math.max(10, Math.min(34, (pw / Math.max(1, weeks.length)) * 0.62));

  const bars = weeks
    .map((w, i) => {
      const cx = pad.l + ((i + 0.5) / Math.max(1, weeks.length)) * pw;
      const h = (w.distinctPosters / maxP) * ph;
      const y = pad.t + ph - h;
      const showLbl = weeks.length <= 10 || i % 2 === 0 || i === weeks.length - 1;
      return `
        <rect x="${(cx - bw / 2).toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(2, h).toFixed(1)}" rx="3" fill="#D9A097" fill-opacity="0.88">
          <title>Week ${esc(w.week)}: ${w.distinctPosters} distinct posters, ${w.tasksPosted} tasks, ${fmtUsd(w.rewardUsd)} (top poster ${w.topPosterSharePct}%)</title>
        </rect>
        <text x="${cx.toFixed(1)}" y="${(y - 5).toFixed(1)}" text-anchor="middle" fill="#FFF6E8" font-family="Departure Mono, monospace" font-size="10">${w.distinctPosters}</text>
        ${showLbl ? `<text x="${cx.toFixed(1)}" y="${pad.t + ph + 18}" text-anchor="middle" fill="#B0A79D" font-family="Departure Mono, monospace" font-size="9.5">${esc(w.week.slice(5))}</text>` : ""}
      `;
    })
    .join("");

  // Overlay tasks-posted curve in magenta
  const pts = weeks.map((w, i) => {
    const cx = pad.l + ((i + 0.5) / Math.max(1, weeks.length)) * pw;
    const cy = pad.t + ph - (w.tasksPosted / maxT) * ph;
    return `${cx.toFixed(1)},${cy.toFixed(1)}`;
  });

  document.getElementById("posters-viz").innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Distinct task posters per ISO week">
      <line x1="${pad.l}" y1="${pad.t + ph}" x2="${pad.l + pw}" y2="${pad.t + ph}" stroke="#453E37" />
      <g font-family="Departure Mono, monospace" font-size="10">
        <rect x="${pad.l}" y="4" width="10" height="10" rx="2" fill="#D9A097" /><text x="${pad.l + 15}" y="13" fill="#EFE9E2">Distinct Posters / Week</text>
        <line x1="${pad.l + 185}" y1="9" x2="${pad.l + 203}" y2="9" stroke="#E74079" stroke-width="2" /><text x="${pad.l + 209}" y="13" fill="#B0A79D">Tasks Posted (right axis)</text>
      </g>
      ${bars}
      <polyline points="${pts.join(" ")}" fill="none" stroke="#E74079" stroke-width="2" />
      <text x="${pad.l + pw + 6}" y="${pad.t + 6}" fill="#E74079" font-family="Departure Mono, monospace" font-size="9.5">${fmtInt(maxT)}</text>
      <text x="${pad.l + pw + 6}" y="${pad.t + ph}" fill="#B0A79D" font-family="Departure Mono, monospace" font-size="9.5">0</text>
    </svg>
  `;

  document.getElementById("top-posters-table").innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>Requester (${esc(CHAIN_META[STATE.chain].label)})</th>
          <th class="num">Tasks</th>
          <th class="num">Done</th>
          <th class="num">Escrow</th>
          <th class="num">Subs</th>
        </tr>
      </thead>
      <tbody>
        ${a.topPosters
          .slice(0, 8)
          .map(
            (p) => `
          <tr>
            <td><strong>${esc(p.label)}</strong><div class="mono" style="font-size:10.5px;color:var(--muted)">${esc(p.addressShort)}</div></td>
            <td class="num">${fmtInt(p.tasks)}</td>
            <td class="num">${fmtInt(p.completed)}</td>
            <td class="num">${fmtCompactUsd(p.rewardUsd)}</td>
            <td class="num">${fmtInt(p.submissions)}</td>
          </tr>`
          )
          .join("")}
      </tbody>
    </table>
  `;
}

/* 6. Tasks by Mode & Status Breakdown */
function renderBreakdown() {
  const snap = STATE.snap;
  const a = activeAnalytics();
  const isPlatform = STATE.chain === "combined";

  const modes = isPlatform
    ? [...snap.breakdowns.platform.mode].sort((x, y) => y.count - x.count)
    : Object.entries(a.modeCounts)
        .map(([mode, count]) => ({ mode, count }))
        .sort((x, y) => y.count - x.count);

  const statuses = isPlatform
    ? [...snap.breakdowns.platform.status].sort((x, y) => y.count - x.count)
    : Object.entries(a.statusCounts)
        .map(([status, count]) => ({ status, count }))
        .sort((x, y) => y.count - x.count);

  const maxM = Math.max(1, ...modes.map((m) => m.count));
  const maxS = Math.max(1, ...statuses.map((s) => s.count));

  const renderBars = (rows, keyName, maxVal, accentVal) =>
    rows
      .map((r) => {
        const pct = Math.max(2, (r.count / maxVal) * 100);
        const accent = r[keyName] === accentVal ? "accent" : "";
        return `
          <div class="bar-row">
            <span class="bar-label">${esc(r[keyName])}</span>
            <div class="bar-track"><div class="bar-fill ${accent}" style="width:${pct.toFixed(1)}%"></div></div>
            <span class="bar-val">${fmtInt(r.count)}</span>
          </div>`;
      })
      .join("");

  document.getElementById("breakdown-grid").innerHTML = `
    <div class="breakdown-panel">
      <h3>By Task Mode (${isPlatform ? "Platform API Total" : esc(CHAIN_META[STATE.chain].label) + " Public"})</h3>
      ${renderBars(modes, "mode", maxM, "bounty")}
    </div>
    <div class="breakdown-panel">
      <h3>By Task Status (${isPlatform ? "Platform API Total" : esc(CHAIN_META[STATE.chain].label) + " Public"})</h3>
      ${renderBars(statuses, "status", maxS, "open")}
    </div>
  `;
}

/* 7. Activity Heatmap */
function renderHeatmap() {
  const hm = STATE.snap.heatmaps[STATE.hmDim]?.[STATE.hmRange];
  const wrap = document.getElementById("heatmap-viz");
  if (!hm || !hm.rowKeys || !hm.colKeys) {
    wrap.innerHTML = `<p class="inspector-empty">No heatmap cells available for this range.</p>`;
    return;
  }

  const lookup = new Map();
  let maxCount = 1;
  for (const c of hm.cells || []) {
    lookup.set(`${c.row}|||${c.col}`, c);
    if (c.count > maxCount) maxCount = c.count;
  }

  const rows = hm.rowKeys;
  const cols = hm.colKeys.slice(-31); // Keep mode x date crisp if "all" has many columns
  const cellW = STATE.hmDim === "hourOfWeek" ? 32 : Math.max(18, Math.floor(820 / Math.max(1, cols.length)));
  const cellH = STATE.hmDim === "hourOfWeek" ? 28 : 34;
  const padL = STATE.hmDim === "hourOfWeek" ? 48 : 88;
  const padT = 26;
  const W = padL + cols.length * cellW + 16;
  const H = padT + rows.length * cellH + 22;

  function cellFill(count) {
    if (!count) return "#181512";
    const t = Math.pow(count / maxCount, 0.72);
    if (t > 0.78) return "#E74079";
    if (t > 0.5) return "#B8556C";
    if (t > 0.25) return "#7E484B";
    return "#49312D";
  }

  let cellsHtml = "";
  rows.forEach((rk, ri) => {
    const rLabel = STATE.hmDim === "hourOfWeek" ? DAYS_UTC[Number(rk)] || rk : rk;
    const y = padT + ri * cellH;
    cellsHtml += `<text x="${padL - 8}" y="${y + cellH / 2 + 4}" text-anchor="end" fill="#B0A79D" font-family="Departure Mono, monospace" font-size="10.5">${esc(rLabel)}</text>`;
    cols.forEach((ck, ci) => {
      const x = padL + ci * cellW;
      const cell = lookup.get(`${rk}|||${ck}`);
      const cnt = cell ? cell.count : 0;
      cellsHtml += `<rect x="${x + 1.5}" y="${y + 1.5}" width="${cellW - 3}" height="${cellH - 3}" rx="4" fill="${cellFill(cnt)}" stroke="#221E1A" stroke-width="0.6">
        <title>${esc(rLabel)} · ${esc(ck)}: ${fmtInt(cnt)} events</title>
      </rect>`;
    });
  });

  const colLabels = cols
    .map((ck, ci) => {
      const x = padL + ci * cellW + cellW / 2;
      const show = STATE.hmDim === "hourOfWeek" ? ci % 2 === 0 : ci % Math.max(1, Math.floor(cols.length / 8)) === 0 || ci === cols.length - 1;
      if (!show) return "";
      const txt = STATE.hmDim === "hourOfWeek" ? `${String(ck).padStart(2, "0")}` : String(ck).slice(5);
      return `<text x="${x}" y="15" text-anchor="middle" fill="#B0A79D" font-family="Departure Mono, monospace" font-size="9.5">${esc(txt)}</text>`;
    })
    .join("");

  wrap.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Taskmarket activity heatmap">
    ${colLabels}
    ${cellsHtml}
  </svg>`;
}

/* 8. Live Activity Feed */
function renderFeed() {
  const items = (STATE.snap.activityFeed || []).filter((it) => {
    if (STATE.chain === "tempo" && it.chainId !== 4217) return false;
    if (STATE.chain === "base" && it.chainId !== 8453) return false;
    if (STATE.feedType !== "all" && it.type !== STATE.feedType) return false;
    return true;
  });

  const list = document.getElementById("feed-list");
  if (!items.length) {
    list.innerHTML = `<div class="feed-item"><span class="inspector-empty">No matching recent events in this filter.</span></div>`;
    return;
  }

  list.innerHTML = items
    .slice(0, 40)
    .map((it) => {
      const ch = it.chainId === 4217 ? "TEMPO" : it.chainId === 8453 ? "BASE" : String(it.chainId);
      const isAward = it.type.includes("complete") || it.type.includes("award");
      const amtStr = it.amountUsd != null ? ` · ${fmtUsd(it.amountUsd)}` : "";
      return `
        <div class="feed-item">
          <span class="pill ${isAward ? "accent" : ""}">${esc(it.type.replace("task_", ""))}</span>
          <span class="pill">${esc(ch)}</span>
          <a class="feed-title" href="https://taskmarket.dev/tasks/${encodeURIComponent(it.taskId)}" target="_blank" rel="noopener">
            ${esc(it.taskTitle || it.taskId)} <span class="mono" style="color:var(--muted);font-size:11px">by ${esc(it.actorShort)}${esc(amtStr)}</span>
          </a>
          <span class="feed-time">${esc(fmtUtcShort(it.timestamp).slice(5))}</span>
        </div>`;
    })
    .join("");
}

/* 9. Methods & Provenance */
function renderMethods() {
  const s = STATE.snap;
  document.getElementById("methods-body").innerHTML = `
    <div class="methods-box">
      <h3>Endpoints fetched server-side</h3>
      <ul class="endpoint-list">
        ${s.endpointsUsed.map((ep) => `<li>${esc(s.apiBaseUrl + ep)}</li>`).join("")}
      </ul>
    </div>
    <div class="methods-box">
      <h3>Refresh, caching &amp; API scoping note</h3>
      <p style="margin:0 0 8px">
        <strong>Data as of:</strong> <code>${esc(s.fetchedAtUtc)}</code><br />
        <strong>Refresh cadence:</strong> ${esc(s.refreshCadence)}.<br />
        <strong>Caching:</strong> Static CDN + Node server in-memory TTL <code>${s.cacheTtlSeconds}s</code> (≥ 60s). Zero direct browser calls to <code>api.taskmarket.dev</code>.
      </p>
      <p style="margin:0">
        <strong>Empirical API note:</strong> <code>/api/market/stats</code> returns chain-specific <code>paidWorkers</code> and <code>activeWallets</code>, while <code>/api/stats/breakdowns</code>, <code>platform-time-series</code>, and <code>activity-heatmap</code> aggregate across both chains (${s.apiNotes.breakdownsIdenticalAcrossChains ? "verified identical for 4217 & 8453" : "chain-scoped"}). Distinct weekly posters, per-chain mortality, escrow flows, and swarm convergence are computed verbatim from all paginated public tasks (<code>${fmtInt(s.apiNotes.pagination.tempoTasksFetched)}</code> Tempo across ${s.apiNotes.pagination.tempoPagesFetched} pages; <code>${fmtInt(s.apiNotes.pagination.baseTasksFetched)}</code> Base across ${s.apiNotes.pagination.basePagesFetched} pages).
      </p>
    </div>
  `;
}

function renderAll() {
  syncActiveButtons();
  renderHero();
  renderFlow();
  renderSwarm();
  renderTimeSeries();
  renderPosters();
  renderBreakdown();
  renderHeatmap();
  renderFeed();
  renderMethods();
}

function bindEvents() {
  document.getElementById("chain-switch").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-chain]");
    if (!btn) return;
    STATE.chain = btn.dataset.chain;
    STATE.flowFocus = null;
    STATE.selectedTaskId = null;
    renderAll();
  });

  document.getElementById("flow-reset").addEventListener("click", () => {
    STATE.flowFocus = null;
    renderFlow();
  });

  document.getElementById("swarm-status-filter").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-status]");
    if (!btn) return;
    STATE.swarmStatus = btn.dataset.status;
    syncActiveButtons();
    renderSwarm();
  });

  document.getElementById("ts-range").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-range]");
    if (!btn) return;
    STATE.tsRange = btn.dataset.range;
    syncActiveButtons();
    renderTimeSeries();
  });

  document.getElementById("ts-bucket").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-bucket]");
    if (!btn) return;
    STATE.tsBucket = btn.dataset.bucket;
    syncActiveButtons();
    renderTimeSeries();
  });

  document.getElementById("hm-dim").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-dim]");
    if (!btn) return;
    STATE.hmDim = btn.dataset.dim;
    syncActiveButtons();
    renderHeatmap();
  });

  document.getElementById("hm-range").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-range]");
    if (!btn) return;
    STATE.hmRange = btn.dataset.range;
    syncActiveButtons();
    renderHeatmap();
  });

  document.getElementById("feed-type").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-type]");
    if (!btn) return;
    STATE.feedType = btn.dataset.type;
    syncActiveButtons();
    renderFeed();
  });

  document.querySelectorAll("[data-copy-view]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const url = buildDeepLink(btn.dataset.copyView);
      try {
        await navigator.clipboard.writeText(url);
        showToast(`Copied link to #${btn.dataset.copyView}`);
      } catch {
        window.location.hash = `#${btn.dataset.copyView}`;
        showToast(`Updated URL to #${btn.dataset.copyView}`);
      }
    });
  });

  document.querySelectorAll("[data-share-card]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const view = btn.dataset.shareCard;
      const a = activeAnalytics();
      const msT = STATE.snap.marketStats.tempo;
      const meta = CHAIN_META[STATE.chain];
      const latestWk = a.weeklyPosters.at(-1);

      const presets = {
        overview: {
          titleLead: "Where the market ",
          titleAccent: "moves.",
          subtitle: "Live escrow flows, weekly distinct posters, and settlements on Tempo & Base.",
          stats: [
            { label: "Active Agents (7d)", value: fmtInt(msT.activeAgents7d), sub: "Platform 7-day active" },
            { label: "Public Tasks", value: fmtInt(a.totalTasks), sub: meta.label },
            { label: "Escrow Volume", value: fmtCompactUsd(a.totalRewardUsd), sub: meta.asset },
            { label: "Distinct Posters", value: fmtInt(a.distinctPostersAllTime), sub: `Top 3 = ${a.concentration.top3TaskSharePct}%` },
          ],
        },
        flow: {
          titleLead: "Escrow flow to ",
          titleAccent: "outcomes.",
          subtitle: `Tracing ${fmtUsd(a.totalRewardUsd)} across ${fmtInt(a.totalTasks)} public tasks on ${meta.label}.`,
          stats: [
            { label: "Completed Escrow", value: fmtCompactUsd(a.completedRewardUsd), sub: `${a.mortality.completionRatePct}% resolved` },
            { label: "Open Escrow", value: fmtCompactUsd(a.openRewardUsd), sub: `${fmtInt(a.statusCounts.open || 0)} open tasks` },
            { label: "Expired / Cancel", value: `${a.mortality.mortalityPct}%`, sub: fmtCompactUsd(a.deadRewardUsd) },
            { label: "Top 3 Share", value: `${a.concentration.top3UsdSharePct}%`, sub: "of escrowed value" },
          ],
        },
        swarm: {
          titleLead: "How the swarm ",
          titleAccent: "converges.",
          subtitle: `Submission density across ${fmtInt(a.totalTasks)} public tasks on ${meta.label}.`,
          stats: [
            { label: "Total Submissions", value: fmtInt(a.totalSubmissions), sub: `Avg ${a.avgSubmissionsPerTask}/task` },
            { label: "Median / P90", value: `${a.medianSubmissions} / ${a.p90Submissions}`, sub: `Max ${fmtInt(a.maxSubmissions)}` },
            { label: "Zero-Sub Tasks", value: `${a.zeroSubPct}%`, sub: `${fmtInt(a.zeroSubTasks)} untouched` },
            { label: "25+ Entry Tasks", value: fmtInt(a.highSubTasks), sub: "High-swarm concentration" },
          ],
        },
        timeseries: {
          titleLead: "Activity ",
          titleAccent: "over time.",
          subtitle: `Platform time series (${STATE.tsRange} · ${STATE.tsBucket} buckets) from api.taskmarket.dev.`,
          stats: [
            { label: "Active Agents 7d", value: fmtInt(msT.activeAgents7d), sub: `${fmtInt(msT.activeWorkers7d)} workers` },
            { label: "Range / Bucket", value: `${STATE.tsRange} / ${STATE.tsBucket}`, sub: "Platform aggregate" },
            { label: "Tempo Paid Workers", value: fmtInt(STATE.snap.marketStats.tempo.paidWorkers), sub: "OUSD (4217)" },
            { label: "Base Paid Workers", value: fmtInt(STATE.snap.marketStats.base.paidWorkers), sub: "USDC (8453)" },
          ],
        },
        posters: {
          titleLead: "Distinct posters ",
          titleAccent: "per week.",
          subtitle: `Unique requesters computed from all paginated public tasks on ${meta.label}.`,
          stats: [
            { label: "All-Time Posters", value: fmtInt(a.distinctPostersAllTime), sub: meta.label },
            { label: "Latest Week", value: fmtInt(latestWk?.distinctPosters || 0), sub: latestWk?.week || "—" },
            { label: "Top 3 Task Share", value: `${a.concentration.top3TaskSharePct}%`, sub: `HHI ${fmtInt(a.concentration.hhiTasks)}` },
            { label: "Top Poster", value: (a.topPosters[0]?.label || "—").slice(0, 14), sub: `${fmtInt(a.topPosters[0]?.tasks || 0)} tasks` },
          ],
        },
        breakdown: {
          titleLead: "Modes and ",
          titleAccent: "outcomes.",
          subtitle: `Distribution of task modes and statuses on ${meta.label}.`,
          stats: [
            { label: "Bounties", value: fmtInt(a.modeCounts.bounty || 0), sub: "Public tasks" },
            { label: "Claims", value: fmtInt(a.modeCounts.claim || 0), sub: "Public tasks" },
            { label: "Completed", value: fmtInt(a.statusCounts.completed || 0), sub: `${a.mortality.completionRatePct}% of resolved` },
            { label: "Expired/Cancel", value: fmtInt(a.mortality.expiredCount + a.mortality.cancelledCount), sub: `${a.mortality.mortalityPct}% mortality` },
          ],
        },
        heatmap: {
          titleLead: "Activity ",
          titleAccent: "rhythm.",
          subtitle: `Taskmarket UTC activity cadence (${STATE.hmDim} · ${STATE.hmRange}).`,
          stats: [
            { label: "Dimension", value: STATE.hmDim === "hourOfWeek" ? "7x24 UTC" : "By Mode", sub: `Range ${STATE.hmRange}` },
            { label: "Active Agents 7d", value: fmtInt(msT.activeAgents7d), sub: "Platform headline" },
            { label: "Tempo Tasks", value: fmtInt(STATE.snap.analytics.tempo.totalTasks), sub: "OUSD (4217)" },
            { label: "Base Tasks", value: fmtInt(STATE.snap.analytics.base.totalTasks), sub: "USDC (8453)" },
          ],
        },
      };

      const cfg = presets[view] || presets.overview;
      await downloadViewShareCard({
        viewKey: view,
        chainLabel: meta.label,
        ...cfg,
        fetchedAtUtc: STATE.snap.fetchedAtUtc,
      });
      showToast(`Saved 1200×630 share card (${view})`);
    });
  });
}

async function init() {
  parseHashState();
  bindEvents();
  const res = await fetch("./data/snapshot.json", { cache: "default" });
  if (!res.ok) throw new Error(`Failed to load snapshot.json (${res.status})`);
  STATE.snap = await res.json();
  renderAll();
}

init().catch((err) => {
  console.error(err);
  const el = document.getElementById("asof-text");
  if (el) el.textContent = "Snapshot failed to load";
});
