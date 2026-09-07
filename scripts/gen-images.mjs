#!/usr/bin/env node
/**
 * Civil Celebrant HK image generator.
 *
 * Writes self-contained HTML into guide-images/<slug>/src/*.html, one file
 * per diagram plus the social card, per IMAGE-SYSTEM.md. A separate headless
 * Edge pass (see the render command in IMAGE-SYSTEM.md section 4, or
 * render.sh next to this file) turns each HTML file into a PNG at 2x.
 *
 * Usage:
 *   node scripts/gen-images.mjs <slug>
 *   node scripts/gen-images.mjs how-to-get-married-in-hong-kong
 *
 * Only the four phase-1 builders are implemented: timelineRail, stepsFlow,
 * decisionFlow, checklistCard, plus the social card. compareTable, costStack,
 * venueGrid, ceremonyStructure, bilingualCard and quoteCard (IMAGE-SYSTEM.md
 * section 3, builders 5-10) are not needed until guide 3 (compareTable,
 * costStack) and later, and are not ported yet.
 *
 * FONTS: this generates a working @import fallback to Google Fonts so the
 * HTML renders correctly for review. Before the real Edge screenshot pass,
 * swap in the local @font-face block IMAGE-SYSTEM.md section 4 specifies
 * (Bricolage Grotesque + Hanken Grotesk .woff2 files), or Edge silently
 * substitutes Segoe UI and the whole set looks off brand.
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// 1. Brand tokens, IMAGE-SYSTEM.md section 1. Do not add a colour not here.
// ---------------------------------------------------------------------------
const TOKENS = {
  jade: "#2E5A4E",
  jade2: "#3F776A",
  jadeDark: "#244A40",
  cream: "#F6F2E9",
  cream2: "#EFE9DB",
  rose: "#C7726A",
  roseSoft: "#F3D8D2",
  gold: "#E8C48A",
  ink: "#1E1A16",
  muted: "#6d6459",
  line: "#E1D8C6",
};

// Canvas is always 1200px wide, displayed at 680px, so the divisor is 1.75.
// Section 2 floors, canvas sizes:
const TYPE = {
  body: 24, // never below 22
  tag: 21,
  shapeLabel: 30, // 28 to 32
  title: 34,
  stat: 64,
  caption: 19,
};

const FONT_IMPORT = `@import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,600;12..96,700&family=Hanken+Grotesk:wght@400;500;600&display=swap');
/* PRODUCTION: replace the @import above with local @font-face rules, see
   IMAGE-SYSTEM.md section 4. Edge falls back to Segoe UI without it. */`;

// ---------------------------------------------------------------------------
// Shell: wraps a builder's body markup in the page every image is shot from.
// ---------------------------------------------------------------------------
function shell({ width = 1200, height, body, extraCss = "" }) {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
${FONT_IMPORT}
:root{
  --jade:${TOKENS.jade}; --jade-2:${TOKENS.jade2}; --jade-dark:${TOKENS.jadeDark};
  --cream:${TOKENS.cream}; --cream-2:${TOKENS.cream2};
  --rose:${TOKENS.rose}; --rose-soft:${TOKENS.roseSoft}; --gold:${TOKENS.gold};
  --ink:${TOKENS.ink}; --muted:${TOKENS.muted}; --line:${TOKENS.line};
}
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${width}px;height:${height}px;overflow:hidden;background:var(--cream);
  font-family:'Hanken Grotesk',sans-serif;color:var(--ink)}
.title-font{font-family:'Bricolage Grotesque',sans-serif;letter-spacing:-.015em;line-height:1.04}
${extraCss}
</style>
</head>
<body>
${body}
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Builder 1: timelineRail
// A horizontal jade rail on cream, rose/jade-2 dots at each event.
// events: [{ day, label, sublabel, kind: 'floor' | 'target' | 'expiry' }]
// ---------------------------------------------------------------------------
function timelineRail({ title, spanDays, events, footnote }) {
  const width = 1200;
  const height = 420;
  const railY = 220;
  const padX = 90;
  const railW = width - padX * 2;
  const dotColor = { floor: TOKENS.rose, target: TOKENS.jade2, expiry: TOKENS.rose };

  const dots = events
    .map((e, i) => {
      const x = padX + (e.day / spanDays) * railW;
      const above = i % 2 === 0;
      const labelY = above ? railY - 46 : railY + 40;
      const dateY = above ? railY - 20 : railY + 68;
      // Edge points sit flush with the rail's ends, so a centred label can run
      // past the canvas. Anchor the first point's text to grow rightward and
      // the last point's text to grow leftward; everything in between stays centred.
      const anchor = i === 0 ? "start" : i === events.length - 1 ? "end" : "middle";
      return `
      <circle cx="${x}" cy="${railY}" r="10" fill="${dotColor[e.kind] || TOKENS.jade}" />
      <text x="${x}" y="${labelY}" text-anchor="${anchor}" class="title-font"
            font-size="${TYPE.shapeLabel}" font-weight="600" fill="${TOKENS.ink}">${e.label}</text>
      <text x="${x}" y="${dateY}" text-anchor="${anchor}"
            font-size="${TYPE.tag}" fill="${TOKENS.muted}">${e.sublabel}</text>`;
    })
    .join("");

  const body = `
  <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <text x="${padX}" y="60" class="title-font" font-size="${TYPE.title}" font-weight="700" fill="${TOKENS.jadeDark}">${title}</text>
    <line x1="${padX}" y1="${railY}" x2="${padX + railW}" y2="${railY}" stroke="${TOKENS.jade}" stroke-width="4" stroke-linecap="round" />
    ${dots}
    <text x="${padX}" y="${height - 24}" font-size="${TYPE.caption}" fill="${TOKENS.muted}">${footnote || ""}</text>
  </svg>`;
  return shell({ width, height, body });
}

// ---------------------------------------------------------------------------
// Builder 2: stepsFlow
// 2 to 4 steps, no branching. Cream cards, rose numbered circle top left.
// ---------------------------------------------------------------------------
function stepsFlow({ title, steps }) {
  const width = 1200;
  const gap = 24;
  const padX = 60;
  const cardW = (width - padX * 2 - gap * (steps.length - 1)) / steps.length;

  // Wrap every step's text up front so the card height can grow to fit
  // whichever step has the most text, instead of a fixed height that clips
  // the last body line for longer copy (e.g. the "anywhere else with a
  // celebrant" step). All cards share one height so the row stays even.
  //
  // Titles get their own (wider) avgCharPx: they render bold in Bricolage
  // Grotesque at 28px, which is noticeably wider per character than the
  // default 13px estimate tuned for the 22px regular body copy. Using the
  // body's estimate for titles let strings like "Marry within 3 months"
  // measure as "fits on one line" and then run past the card's right edge
  // once actually rendered in the real font. Titles are now also allowed to
  // wrap to a second line instead of silently dropping the overflow.
  const titleLineHeight = 32;
  const lineHeight = 28;
  const bottomPad = 30;
  const wrapped = steps.map((s) => ({
    titleLines: wrapSvgText(s.title, cardW - 48, 17),
    bodyLines: wrapSvgText(s.body, cardW - 48),
  }));
  const perStep = wrapped.map((w) => {
    const bodyTop = 185 + (w.titleLines.length - 1) * titleLineHeight + 30;
    const neededH = (bodyTop - 90) + (w.bodyLines.length - 1) * lineHeight + bottomPad;
    return { ...w, bodyTop, neededH };
  });
  const cardH = Math.max(190, ...perStep.map((s) => s.neededH));
  const height = 90 + cardH + 40;

  const cards = steps
    .map((s, i) => {
      const x = padX + i * (cardW + gap);
      const { titleLines, bodyLines, bodyTop } = perStep[i];
      return `
      <g>
        <rect x="${x}" y="90" width="${cardW}" height="${cardH}" rx="16" fill="#fff" stroke="${TOKENS.line}" stroke-width="1.5" />
        <circle cx="${x + 40}" cy="130" r="20" fill="${TOKENS.rose}" />
        <text x="${x + 40}" y="138" text-anchor="middle" class="title-font" font-size="22" font-weight="700" fill="#fff">${i + 1}</text>
        ${titleLines
          .map((line, li) => `<text x="${x + 24}" y="${185 + li * titleLineHeight}" class="title-font" font-size="${TYPE.shapeLabel - 2}" font-weight="600" fill="${TOKENS.ink}">${line}</text>`)
          .join("")}
        ${bodyLines
          .map((line, li) => `<text x="${x + 24}" y="${bodyTop + li * lineHeight}" font-size="${TYPE.body - 2}" fill="${TOKENS.muted}">${line}</text>`)
          .join("")}
      </g>`;
    })
    .join("");

  const body = `
  <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <text x="${padX}" y="50" class="title-font" font-size="${TYPE.title}" font-weight="700" fill="${TOKENS.jadeDark}">${title}</text>
    ${cards}
  </svg>`;
  return shell({ width, height, body });
}

// ---------------------------------------------------------------------------
// Builder 3: decisionFlow
// Diamond for the question (jade outline), cream boxes for outcomes, rose
// labels on branch edges. Max 2 branches per node, 3 nodes deep.
// ---------------------------------------------------------------------------
function decisionFlow({ title, root }) {
  // root: { q, yes: {label, outcome?} | {q, ...}, no: same }
  const width = 1200;

  // outcomeBox now reports the height it actually needs for its wrapped
  // text (see below), so build every box first and size the canvas to the
  // tallest one instead of a fixed 620 that clipped longer outcomes.
  const yesBox = root.yes.outcome ? outcomeBox(180, 300, root.yes.outcome, "left", 300) : null;
  const noBox = root.no.outcome ? outcomeBox(1020, 300, root.no.outcome, "right", 300) : null;
  const yesYesBox = !root.yes.outcome && root.yes.yes ? outcomeBox(120, 480, root.yes.yes.outcome, "left", 260) : null;
  const yesNoBox = !root.yes.outcome && root.yes.no ? outcomeBox(480, 480, root.yes.no.outcome, "left", 260) : null;
  const noYesBox = !root.no.outcome && root.no.yes ? outcomeBox(620, 480, root.no.yes.outcome, "left", 260) : null;
  const noNoBox = !root.no.outcome && root.no.no ? outcomeBox(1180, 480, root.no.no.outcome, "right", 260) : null;

  const lowestBottom = Math.max(
    620, // never shrink below the original canvas height
    300 + (yesBox ? yesBox.height : 0),
    300 + (noBox ? noBox.height : 0),
    480 + (yesYesBox ? yesYesBox.height : 0),
    480 + (yesNoBox ? yesNoBox.height : 0),
    480 + (noYesBox ? noYesBox.height : 0),
    480 + (noNoBox ? noNoBox.height : 0)
  );
  const height = lowestBottom + 40;

  const body = `
  <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="Hanken Grotesk, sans-serif">
    <text x="60" y="50" class="title-font" font-size="${TYPE.title}" font-weight="700" fill="${TOKENS.jadeDark}">${title}</text>
    ${diamond(600, 140, root.q)}
    ${edgeLabel(430, 210, root.yesLabel)}
    ${edgeLabel(770, 210, root.noLabel)}
    ${yesBox ? yesBox.markup : diamond(300, 320, root.yes.q)}
    ${noBox ? noBox.markup : diamond(900, 320, root.no.q)}
    ${root.yes.outcome ? "" : `
      ${edgeLabel(160, 400, root.yes.yesLabel)}
      ${edgeLabel(440, 400, root.yes.noLabel)}
      ${yesYesBox.markup}
      ${yesNoBox.markup}
    `}
    ${root.no.outcome ? "" : `
      ${edgeLabel(760, 400, root.no.yesLabel)}
      ${edgeLabel(1040, 400, root.no.noLabel)}
      ${noYesBox.markup}
      ${noNoBox.markup}
    `}
    <line x1="600" y1="180" x2="430" y2="280" stroke="${TOKENS.line}" stroke-width="2" />
    <line x1="600" y1="180" x2="770" y2="280" stroke="${TOKENS.line}" stroke-width="2" />
  </svg>`;
  return shell({ width, height, body });
}

function diamond(cx, cy, label) {
  // A rhombus is only its full width at the vertical centre; it narrows to
  // a point at the top and bottom. Wrapping text to the full width (as
  // before) put the outer lines of any 2-3 line label past the slanted
  // edges. Widened the shape and wrap to the width actually available at
  // the outermost line's vertical offset (the tightest constraint),
  // iterating since a narrower wrap width can itself produce more lines.
  const w = 400, h = 90;
  const lineSpacing = 22;
  let lines = wrapSvgText(label, w - 60);
  for (let i = 0; i < 3; i++) {
    const n = Math.max(1, lines.length);
    const outerOffset = ((n - 1) / 2) * lineSpacing;
    const ratio = Math.min(0.9, outerOffset / (h / 2));
    const safeWidth = Math.max(80, w * (1 - ratio) - 40);
    const next = wrapSvgText(label, safeWidth);
    if (next.length === lines.length) { lines = next; break; }
    lines = next;
  }
  const pts = `${cx},${cy - h / 2} ${cx + w / 2},${cy} ${cx},${cy + h / 2} ${cx - w / 2},${cy}`;
  return `
  <polygon points="${pts}" fill="${TOKENS.cream}" stroke="${TOKENS.jade}" stroke-width="2" />
  ${lines
    .map((line, i, arr) => `<text x="${cx}" y="${cy + (i - (arr.length - 1) / 2) * lineSpacing + 6}" text-anchor="middle" font-size="${TYPE.body - 4}" font-weight="600" fill="${TOKENS.ink}">${line}</text>`)
    .join("")}`;
}

// Returns { markup, height } instead of a fixed 130px box, so the caller can
// grow the canvas to fit whichever outcome has the most wrapped text (e.g.
// "Licensed place of worship / Competent minister, 7am to 7pm" needs more
// than 130px and was previously spilling text out the bottom of the card).
function outcomeBox(x, y, text, align = "left", width = 300) {
  const w = width;
  const lines = wrapSvgText(text, w - 32);
  const h = Math.max(130, 36 + (lines.length - 1) * 26 + 40);
  const bx = align === "right" ? x - w : x;
  const markup = `
  <rect x="${bx}" y="${y}" width="${w}" height="${h}" rx="14" fill="#fff" stroke="${TOKENS.line}" stroke-width="1.5" />
  ${lines
    .map((line, i) => `<text x="${bx + 16}" y="${y + 36 + i * 26}" font-size="${TYPE.body - 4}" fill="${TOKENS.ink}">${line}</text>`)
    .join("")}`;
  return { markup, height: h };
}

function edgeLabel(x, y, text) {
  return `<text x="${x}" y="${y}" text-anchor="middle" font-size="${TYPE.tag}" font-weight="600" fill="${TOKENS.rose}">${text}</text>`;
}

// ---------------------------------------------------------------------------
// Builder 4: checklistCard
// Cream panel, one row per item, jade tick, muted qualifier on the right.
// ---------------------------------------------------------------------------
function checklistCard({ title, items }) {
  const width = 1200;
  const rowH = 76;
  const height = 110 + items.length * rowH + 30;
  const padX = 60;

  const rows = items
    .map((it, i) => {
      const y = 110 + i * rowH;
      return `
      <line x1="${padX}" y1="${y}" x2="${width - padX}" y2="${y}" stroke="${TOKENS.line}" stroke-width="1" />
      <text x="${padX}" y="${y + 46}" font-size="18" fill="${TOKENS.jade}" font-weight="700">&#10003;</text>
      <text x="${padX + 40}" y="${y + 46}" font-size="${TYPE.body}" fill="${TOKENS.ink}">${it.label}</text>
      <text x="${width - padX}" y="${y + 46}" text-anchor="end" font-size="${TYPE.tag}" fill="${TOKENS.muted}">${it.qualifier || ""}</text>`;
    })
    .join("");

  const body = `
  <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <text x="${padX}" y="60" class="title-font" font-size="${TYPE.title}" font-weight="700" fill="${TOKENS.jadeDark}">${title}</text>
    ${rows}
  </svg>`;
  return shell({ width, height, body });
}

// ---------------------------------------------------------------------------
// Social card, 1200x630. Hook headline, one word in rose, no subtitle.
// ---------------------------------------------------------------------------
function social({ hook, roseWord }) {
  const width = 1200, height = 630;
  const parts = hook.split(roseWord);
  const body = `
  <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <rect width="${width}" height="${height}" fill="${TOKENS.cream}" />
    <rect x="0" y="${height - 3}" width="${width}" height="3" fill="${TOKENS.jade}" />
    <rect x="60" y="60" width="72" height="72" rx="16" fill="${TOKENS.jade}" />
    <path d="M 90.6 86.64 A 10.08 10.08 0 1 0 90.6 105.36" fill="none" stroke="${TOKENS.cream}" stroke-width="2.34" stroke-linecap="round" />
    <path d="M 101.4 105.36 A 10.08 10.08 0 1 0 101.4 86.64" fill="none" stroke="${TOKENS.gold}" stroke-width="2.34" stroke-linecap="round" />
    <circle cx="96" cy="96" r="1.62" fill="${TOKENS.rose}" />
    ${wrapSvgText(hook, width - 220, 4)
      .map((line, i, arr) => {
        const y = height / 2 - ((arr.length - 1) / 2 - i) * 84;
        const roseHere = line.includes(roseWord);
        if (!roseHere) return `<text x="${width / 2}" y="${y}" text-anchor="middle" class="title-font" font-size="72" font-weight="700" fill="${TOKENS.ink}">${line}</text>`;
        const [before, after] = line.split(roseWord);
        return `<text x="${width / 2}" y="${y}" text-anchor="middle" class="title-font" font-size="72" font-weight="700" fill="${TOKENS.ink}">${before}<tspan fill="${TOKENS.rose}">${roseWord}</tspan>${after || ""}</text>`;
      })
      .join("")}
  </svg>`;
  return shell({ width, height, body });
}

// ---------------------------------------------------------------------------
// Tiny word-wrap for <text><tspan>, avoids <foreignObject> per the gotchas.
// ---------------------------------------------------------------------------
function wrapSvgText(text, maxWidthPx, avgCharPx = 13) {
  const maxChars = Math.max(6, Math.floor(maxWidthPx / avgCharPx));
  // Treat \n in the source data as a hard break, then word-wrap each
  // paragraph on its own. Splitting on spaces alone (the old behaviour)
  // glued the word before a \n to the word after it into one oversized
  // "word", which threw off wrapping for every string that used \n.
  const paragraphs = String(text).split("\n");
  const lines = [];
  for (const para of paragraphs) {
    const words = para.split(" ");
    let line = "";
    for (const w of words) {
      if ((line + " " + w).trim().length > maxChars) {
        if (line) lines.push(line.trim());
        line = w;
      } else {
        line = (line + " " + w).trim();
      }
    }
    if (line) lines.push(line.trim());
  }
  return lines;
}

// ---------------------------------------------------------------------------
// Per-slug config. Add a new key here for each guide as it's drafted.
// ---------------------------------------------------------------------------
const GUIDES = {
  "how-to-get-married-in-hong-kong": {
    steps: {
      builder: stepsFlow,
      data: {
        title: "Three steps to marry in Hong Kong",
        steps: [
          { title: "Give notice", body: "File the Notice of Intended Marriage, HK$305, directly or through a celebrant." },
          { title: "Wait 15 clear days", body: "The statutory floor. 4 to 6 weeks is the comfortable target." },
          { title: "Marry within 3 months", body: "At a registry, a licensed place of worship, or anywhere else with a celebrant." },
        ],
      },
    },
    timeline: {
      builder: timelineRail,
      data: {
        title: "From notice to ceremony",
        spanDays: 90,
        events: [
          { day: 0, label: "Notice given", sublabel: "Day 0", kind: "target" },
          { day: 15, label: "Earliest marriage", sublabel: "Day 15, statutory floor", kind: "floor" },
          { day: 35, label: "Comfortable target", sublabel: "4 to 6 weeks", kind: "target" },
          { day: 90, label: "Notice expires", sublabel: "Day 90", kind: "expiry" },
        ],
        footnote: "The 3 month window runs from the date notice was given, not the date the certificate was issued.",
      },
    },
    decision: {
      builder: decisionFlow,
      data: {
        title: "Where can the ceremony take place?",
        root: {
          q: "Marry at a Marriage Registry?",
          yesLabel: "Yes",
          noLabel: "No",
          yes: { outcome: "Marriage Registry\nHK$715 to HK$1,935, Registrar officiates" },
          no: {
            q: "Licensed place of worship?",
            yesLabel: "Yes",
            noLabel: "No, elsewhere",
            yes: { outcome: "Licensed place of worship\nCompetent minister, 7am to 7pm" },
            no: { outcome: "Any other venue\nCivil celebrant, any hour" },
          },
        },
      },
    },
    checklist: {
      builder: checklistCard,
      data: {
        title: "Documents to bring",
        items: [
          { label: "Hong Kong identity card or valid travel document", qualifier: "both parties" },
          { label: "Written consent, Form MR4", qualifier: "if either party is under 21" },
          { label: "Sealed certified copy of the final decree", qualifier: "if divorced" },
          { label: "Proof of former marriage and death certificate", qualifier: "if widowed" },
          { label: "Certified translation", qualifier: "if a document is not in English or Chinese" },
        ],
      },
    },
    social: {
      builder: social,
      data: { hook: "Fifteen clear days, then you marry.", roseWord: "marry." },
    },
  },
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const slug = process.argv[2];
if (!slug || !GUIDES[slug]) {
  console.error(`Usage: node gen-images.mjs <slug>\nKnown slugs: ${Object.keys(GUIDES).join(", ")}`);
  process.exit(1);
}

const outDir = join(process.cwd(), "guide-images", slug, "src");
mkdirSync(outDir, { recursive: true });

for (const [name, { builder, data }] of Object.entries(GUIDES[slug])) {
  const html = builder(data);
  const file = join(outDir, `${name}.html`);
  writeFileSync(file, html, "utf8");
  console.log(`wrote ${file}`);
}

console.log(`
Next: screenshot each file with headless Edge at 2x (IMAGE-SYSTEM.md section 4):

  msedge --headless=new --disable-gpu --hide-scrollbars \\
    --force-device-scale-factor=2 --window-size=1200,H \\
    --screenshot="guide-images/${slug}/<name>.png" \\
    "file://$(pwd)/guide-images/${slug}/src/<name>.html"

Open every PNG and read it back at page scale (57%), not at 100%, before
this ships. Replace the Google Fonts @import with local @font-face first.
`);
