// reads lines.txt, picks a random selection, builds a typewriter SVG
// run from the repo root: node scripts/generate-typing-svg.js

import { readFileSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();

// how many lines to show per generated cycle
const PICK = 35;

// timing in seconds
const TYPE_SPEED   = 0.048;   // per character while typing
const DELETE_SPEED = 0.028;   // per character while deleting
const HOLD         = 1.6;     // how long to sit on a completed line
const GAP          = 0.18;    // pause between lines

// visual
const SVG_WIDTH  = 800;
const SVG_HEIGHT = 52;
const FONT       = "'Fira Code', 'Courier New', monospace";
const FONT_SIZE  = 15;
const COLOR      = '#7289da';
const CURSOR_W   = 1.5;       // px, number not string
const PAD_LEFT   = 28;


// --- helpers ----------------------------------------------------------------

function shuffle(arr) {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function pct(seconds, total) {
  return ((seconds / total) * 100).toFixed(3) + '%';
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}


// --- load and pick lines ----------------------------------------------------

const allLines = readFileSync(join(ROOT, 'lines.txt'), 'utf8')
  .split('\n')
  .map(l => l.trim())
  .filter(Boolean);

if (allLines.length === 0) {
  console.error('lines.txt is empty');
  process.exit(1);
}

const lines = shuffle(allLines).slice(0, Math.min(PICK, allLines.length));


// --- build timeline ---------------------------------------------------------

let cursor = 0;
const slots = lines.map(line => {
  const chars    = line.length;
  const typeTime = Math.max(chars * TYPE_SPEED, 0.6);
  const delTime  = Math.max(chars * DELETE_SPEED, 0.35);
  const start    = cursor;
  cursor += typeTime + HOLD + delTime + GAP;
  return { line, chars, start, typeTime, delTime };
});

const TOTAL = cursor;


// --- build per-line CSS -----------------------------------------------------
//
// Text spans: opacity + width only, no border.
// Cursor: a separate absolutely-positioned div animated via its own keyframes.
//
// Cursor animations per line:
//   cr{i}  — left position (tracks end of typed text)
//   co{i}  — opacity (hidden outside active window)
// Shared:
//   bl     — blink (opacity 1→0→1 at 0.75s)

const perLineCSS = slots.map(({ chars, start, typeTime, delTime }, i) => {
  const a = pct(start,                                    TOTAL);
  const b = pct(start + typeTime,                         TOTAL);
  const c = pct(start + typeTime + HOLD,                  TOTAL);
  const d = pct(start + typeTime + HOLD + delTime,        TOTAL);
  const e = pct(start + typeTime + HOLD + delTime + 0.05, TOTAL);

  const dur = TOTAL.toFixed(2) + 's';

  // cursor left: starts at PAD_LEFT, moves to PAD_LEFT + chars*ch at b,
  // stays there through hold, then tracks back to PAD_LEFT at d.
  // We express left as PAD_LEFT + N*ch using calc().
  const leftStart = `${PAD_LEFT}px`;
  const leftFull  = `calc(${PAD_LEFT}px + ${chars}ch)`;

  return `
    .t${i} {
      animation:
        op${i} ${dur} linear infinite,
        wd${i} ${dur} linear infinite;
    }
    @keyframes op${i} {
      0%, ${a} { opacity: 0; }
              ${a} { opacity: 1; }
              ${d} { opacity: 1; }
              ${e} { opacity: 0; }
      100%     { opacity: 0; }
    }
    @keyframes wd${i} {
      0%, ${a} { width: 0; }
              ${a} { width: 0; animation-timing-function: steps(${chars}, end); }
              ${b} { width: ${chars}ch; animation-timing-function: linear; }
              ${c} { width: ${chars}ch; animation-timing-function: steps(${chars}, end); }
              ${d}, 100% { width: 0; }
    }
    .cur.t${i} {
      animation:
        co${i} ${dur} linear infinite,
        cr${i} ${dur} linear infinite,
        bl 0.75s step-end infinite;
    }
    @keyframes co${i} {
      0%, ${a} { visibility: hidden; }
              ${a} { visibility: visible; }
              ${e} { visibility: hidden; }
      100%     { visibility: hidden; }
    }
    @keyframes cr${i} {
      0%, ${a} { left: ${leftStart}; }
              ${a} { left: ${leftStart}; animation-timing-function: steps(${chars}, end); }
              ${b} { left: ${leftFull}; animation-timing-function: linear; }
              ${c} { left: ${leftFull}; animation-timing-function: steps(${chars}, end); }
              ${d}, 100% { left: ${leftStart}; }
    }`;
}).join('\n');


// --- assemble SVG -----------------------------------------------------------

const spanHeight = Math.round(FONT_SIZE * 1.4);

const baseCSS = `
    .txt {
      position: absolute;
      left: ${PAD_LEFT}px;
      top: 50%;
      transform: translateY(-50%);
      height: ${spanHeight}px;
      line-height: ${spanHeight}px;
      font-family: ${FONT};
      font-size: ${FONT_SIZE}px;
      color: ${COLOR};
      white-space: nowrap;
      overflow: hidden;
      opacity: 0;
    }
    .cur {
      position: absolute;
      top: 50%;
      transform: translateY(-50%);
      width: ${CURSOR_W}px;
      height: ${spanHeight}px;
      background: ${COLOR};
      visibility: hidden;
    }
    @keyframes bl {
      0%, 100% { opacity: 1; }
      50%      { opacity: 0; }
    }`;

const textSpans = slots
  .map(({ line }, i) => `      <span class="txt t${i}">${escapeHtml(line)}</span>`)
  .join('\n');

const cursorDivs = slots
  .map((_, i) => `      <div class="cur t${i}"></div>`)
  .join('\n');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SVG_WIDTH}" height="${SVG_HEIGHT}" viewBox="0 0 ${SVG_WIDTH} ${SVG_HEIGHT}">
  <foreignObject width="100%" height="100%">
    <div xmlns="http://www.w3.org/1999/xhtml"
         style="position:relative;width:${SVG_WIDTH}px;height:${SVG_HEIGHT}px;overflow:hidden;">
      <style>${baseCSS}${perLineCSS}
      </style>
${textSpans}
${cursorDivs}
    </div>
  </foreignObject>
</svg>`;


// --- write output -----------------------------------------------------------

const outDir  = join(ROOT, 'dist');
const outFile = join(outDir, 'typing.svg');

mkdirSync(outDir, { recursive: true });
writeFileSync(outFile, svg, 'utf8');

console.log(`typing.svg generated  |  ${lines.length} lines  |  ${TOTAL.toFixed(1)}s cycle`);
