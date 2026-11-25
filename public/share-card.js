/**
 * Client-side 1200x630 brand-kit editorial share card generator (zero external servers).
 * Uses the exact loaded Taskmarket brand fonts, palette, and live snapshot numbers per view.
 */

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

export async function downloadViewShareCard({ viewKey, chainLabel, titleLead, titleAccent, subtitle, stats, fetchedAtUtc }) {
  if (document.fonts && document.fonts.ready) {
    await document.fonts.ready;
  }

  const W = 1200;
  const H = 630;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");

  // Ground #12100E
  ctx.fillStyle = "#12100E";
  ctx.fillRect(0, 0, W, H);

  // Maroon glow top-right #3A1420
  const grad = ctx.createRadialGradient(W * 0.86, H * 0.14, 10, W * 0.86, H * 0.14, 720);
  grad.addColorStop(0, "rgba(58, 20, 32, 0.92)");
  grad.addColorStop(1, "rgba(18, 16, 14, 0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Frame border #453E37
  roundRect(ctx, 28, 28, W - 56, H - 56, 18);
  ctx.strokeStyle = "#453E37";
  ctx.lineWidth = 1.2;
  ctx.stroke();

  // Brand lockup top-left (340px wide)
  const lockup = await loadImage("./assets/taskmarket-lockup.png");
  if (lockup) {
    const lw = 340;
    const lh = (lockup.height / lockup.width) * lw;
    ctx.drawImage(lockup, 68, 60, lw, lh);
  }

  // Domain top-right
  ctx.font = '400 22px "Departure Mono", monospace';
  ctx.fillStyle = "#EFE9E2";
  ctx.textAlign = "right";
  ctx.fillText("taskmarket.dev", W - 68, 92);

  // Eyebrow
  ctx.textAlign = "left";
  ctx.font = '400 15px "Departure Mono", monospace';
  ctx.fillStyle = "#D9A097";
  ctx.fillText(`${chainLabel.toUpperCase()}  /  VIEW: ${viewKey.toUpperCase()}`, 68, 162);

  // Serif headline with one italic magenta word
  ctx.font = '400 72px "Instrument Serif", Georgia, serif';
  ctx.fillStyle = "#EFE9E2";
  ctx.fillText(titleLead, 68, 240);
  const leadW = ctx.measureText(titleLead).width;
  ctx.font = 'italic 400 72px "Instrument Serif", Georgia, serif';
  ctx.fillStyle = "#E74079";
  ctx.fillText(titleAccent, 68 + leadW, 240);

  // Subtitle
  ctx.font = '500 23px "Inter Tight", sans-serif';
  ctx.fillStyle = "#B0A79D";
  ctx.fillText(subtitle.slice(0, 88), 68, 290);

  // 4 metric tiles
  const items = stats.slice(0, 4);
  const gap = 18;
  const tileW = (W - 136 - gap * (items.length - 1)) / items.length;
  const tileY = 342;
  const tileH = 156;
  items.forEach((st, i) => {
    const x = 68 + i * (tileW + gap);
    roundRect(ctx, x, tileY, tileW, tileH, 12);
    ctx.fillStyle = "#221E1A";
    ctx.fill();
    ctx.strokeStyle = "#453E37";
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.font = '400 15px "Departure Mono", monospace';
    ctx.fillStyle = "#B0A79D";
    ctx.fillText(st.label.toUpperCase(), x + 20, tileY + 38);

    ctx.font = '400 32px "Departure Mono", monospace';
    ctx.fillStyle = "#FFF6E8";
    ctx.fillText(st.value, x + 20, tileY + 96);

    if (st.sub) {
      ctx.font = '500 15px "Inter Tight", sans-serif';
      ctx.fillStyle = "#B0A79D";
      ctx.fillText(st.sub.slice(0, 28), x + 20, tileY + 132);
    }
  });

  // Footer strip
  const asOf = String(fetchedAtUtc || "").replace("T", " ").slice(0, 16) + " UTC";
  ctx.font = '400 15px "Departure Mono", monospace';
  ctx.fillStyle = "#B0A79D";
  ctx.textAlign = "left";
  ctx.fillText(`DATA AS OF ${asOf}`, 68, 560);

  ctx.textAlign = "right";
  ctx.font = '500 16px "Inter Tight", sans-serif';
  ctx.fillText("Made for Taskmarket bounty TSK-BRK611AN · not an official product", W - 68, 560);

  const link = document.createElement("a");
  link.download = `taskmarket-pulse-${viewKey}-${chainLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
}
