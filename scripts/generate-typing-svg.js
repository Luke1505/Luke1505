// reads lines.txt, picks a random selection, builds a typewriter SVG
// run from the repo root: node scripts/generate-typing-svg.js

import { readFileSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();

// how many lines to show per generated cycle
// with 102 lines total this means each line shows up roughly every 3 days
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
const CURSOR_W   = '1.5px';
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

// convert seconds to a percentage string of the total animation duration
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
// each line gets two keyframe animations:
//   op{i}  controls opacity  (0 outside its window, 1 inside)
//   wd{i}  controls width    (types in, holds, deletes out)
//
// the width animation uses animation-timing-function set at keyframe stops
// so we get steps() for the type/delete phases and linear for the hold phase.
// a shared 'bl' animation handles the cursor blink on the border-right.

const perLineCSS = slots.map(({ chars, start, typeTime, delTime }, i) => {
  const a = pct(start,                         TOTAL);
  const b = pct(start + typeTime,              TOTAL);
  const c = pct(start + typeTime + HOLD,       TOTAL);
  const d = pct(start + typeTime + HOLD + delTime, TOTAL);

  const dur = TOTAL.toFixed(2) + 's';

  return `
    .t${i} {
      animation:
        op${i} ${dur} linear infinite,
        wd${i} ${dur} linear infinite,
        bl 0.75s step-end infinite;
    }
    @keyframes op${i} {
      0%, ${a}  { opacity: 0; }
               ${a}  { opacity: 1; }
               ${d}  { opacity: 1; }
               ${d}  { opacity: 0; }
      100%      { opacity: 0; }
    }
    @keyframes wd${i} {
      0%, ${a} { width: 0; }
              ${a} { width: 0; animation-timing-function: steps(${chars}, end); }
              ${b} { width: ${chars}ch; animation-timing-function: linear; }
              ${c} { width: ${chars}ch; animation-timing-function: steps(${chars}, end); }
              ${d}, 100% { width: 0; }
    }`;
}).join('\n');


// --- assemble SVG -----------------------------------------------------------

const spanHeight = Math.round(FONT_SIZE * 1.4);

const baseCSS = `
    span {
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
      border-right: ${CURSOR_W} solid ${COLOR};
      opacity: 0;
    }
    @keyframes bl {
      0%, 100% { border-color: ${COLOR}; }
      50%      { border-color: transparent; }
    }`;

const spans = slots
  .map(({ line }, i) => `      <span class="t${i}">${escapeHtml(line)}</span>`)
  .join('\n');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SVG_WIDTH}" height="${SVG_HEIGHT}" viewBox="0 0 ${SVG_WIDTH} ${SVG_HEIGHT}">
  <foreignObject width="100%" height="100%">
    <div xmlns="http://www.w3.org/1999/xhtml"
         style="position:relative;width:${SVG_WIDTH}px;height:${SVG_HEIGHT}px;overflow:hidden;">
      <style>${baseCSS}${perLineCSS}
      </style>
${spans}
    </div>
  </foreignObject>
</svg>`;


// --- write output -----------------------------------------------------------

const outDir  = join(ROOT, 'dist');
const outFile = join(outDir, 'typing.svg');

mkdirSync(outDir, { recursive: true });
writeFileSync(outFile, svg, 'utf8');

console.log(`typing.svg generated  |  ${lines.length} lines  |  ${TOTAL.toFixed(1)}s cycle`);
