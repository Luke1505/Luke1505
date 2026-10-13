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
const BLINK        = 0.9;     // cursor blink period

// visual
const SVG_WIDTH  = 800;
const SVG_HEIGHT = 52;
const FONT       = "'Fira Code', 'Courier New', monospace";
const FONT_SIZE  = 15;
const COLOR      = '#7289da';
const CURSOR_W   = 2;         // px
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

let clock = 0;
const slots = lines.map(line => {
  // count code points, not UTF-16 units, so umlauts etc. match the ch width
  const chars    = [...line].length;
  const typeTime = Math.max(chars * TYPE_SPEED, 0.6);
  const delTime  = Math.max(chars * DELETE_SPEED, 0.35);
  const start    = clock;
  clock += typeTime + HOLD + delTime + GAP;
  return { line, chars, start, typeTime, delTime };
});

const TOTAL = clock;
const DUR   = TOTAL.toFixed(3) + 's';


// --- per-line CSS -----------------------------------------------------------
//
// One element per line. The cursor is the span's own right border, so it
// always sits exactly at the end of the visible text. No second element,
// no position math that can drift.
//
//   op{i}  visibility of the whole line (hard on/off, no fading)
//   wd{i}  width in ch, stepped per character for typing and deleting
//   bl     shared blink on the border color

const perLineCSS = slots.map(({ chars, start, typeTime, delTime }, i) => {
  const a = pct(start,                             TOTAL);
  const b = pct(start + typeTime,                  TOTAL);
  const c = pct(start + typeTime + HOLD,           TOTAL);
  const d = pct(start + typeTime + HOLD + delTime, TOTAL);

  return `
    .t${i} {
      animation:
        op${i} ${DUR} step-end infinite,
        wd${i} ${DUR} linear infinite,
        bl ${BLINK}s step-end infinite;
    }
    @keyframes op${i} {
      0%   { opacity: 0; }
      ${a} { opacity: 1; }
      ${d} { opacity: 0; }
      100% { opacity: 0; }
    }
    @keyframes wd${i} {
      0%   { width: 0; }
      ${a} { width: 0;          animation-timing-function: steps(${chars}, end); }
      ${b} { width: ${chars}ch; animation-timing-function: linear; }
      ${c} { width: ${chars}ch; animation-timing-function: steps(${chars}, end); }
      ${d} { width: 0; }
      100% { width: 0; }
    }`;
}).join('\n');


// --- assemble SVG -----------------------------------------------------------

const lineHeight = Math.round(FONT_SIZE * 1.4);

const baseCSS = `
    .txt {
      position: absolute;
      left: ${PAD_LEFT}px;
      top: ${Math.round((SVG_HEIGHT - lineHeight) / 2)}px;
      height: ${lineHeight}px;
      line-height: ${lineHeight}px;
      font-family: ${FONT};
      font-size: ${FONT_SIZE}px;
      font-variant-ligatures: none;
      color: ${COLOR};
      white-space: pre;
      overflow: hidden;
      box-sizing: content-box;
      padding-right: 1px;
      border-right: ${CURSOR_W}px solid ${COLOR};
      width: 0;
      opacity: 0;
    }
    @keyframes bl {
      0%   { border-right-color: ${COLOR}; }
      50%  { border-right-color: transparent; }
      100% { border-right-color: ${COLOR}; }
    }`;

const textSpans = slots
  .map(({ line }, i) => `      <div class="txt t${i}">${escapeHtml(line)}</div>`)
  .join('\n');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SVG_WIDTH}" height="${SVG_HEIGHT}" viewBox="0 0 ${SVG_WIDTH} ${SVG_HEIGHT}">
  <foreignObject width="100%" height="100%">
    <div xmlns="http://www.w3.org/1999/xhtml"
         style="position:relative;width:${SVG_WIDTH}px;height:${SVG_HEIGHT}px;overflow:hidden;">
      <style>${baseCSS}${perLineCSS}
      </style>
${textSpans}
    </div>
  </foreignObject>
</svg>`;


// --- write output -----------------------------------------------------------

const outDir  = join(ROOT, 'dist');
const outFile = join(outDir, 'typing.svg');

mkdirSync(outDir, { recursive: true });
writeFileSync(outFile, svg, 'utf8');

console.log(`typing.svg generated  |  ${lines.length} lines  |  ${TOTAL.toFixed(1)}s cycle`);
