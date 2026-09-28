import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { logger } from '../core/logger/logger';

/**
 * Media for the demo data.
 *
 * Thumbnails, avatars and the hero image are GENERATED as SVG rather than
 * pulled from a stock-photo service. A random photo service gives a database
 * course a picture of a deer, which reads as filler the moment anyone looks at
 * the catalogue; a generated card always matches the course it belongs to and
 * can never 404.
 *
 * Lesson videos are copied out of `assets/demo/` (CC0 clips — see the LICENSE
 * file there). Earlier demo data pointed at third-party YouTube videos, and one
 * of them was deleted by its owner, so the course player showed
 * "Video unavailable". Nothing here depends on anyone else's server.
 *
 * Everything lands in `uploads/demo/`, the directory Express already serves at
 * `/uploads`, following the same repo-assets-to-uploads path as the default
 * branding installer.
 */

const SRC_DIR = path.resolve(process.cwd(), 'assets', 'demo');
const DEST_DIR = path.resolve(process.cwd(), 'uploads', 'demo');

/** Public URL prefix. Relative on purpose — the API host may differ from the web host. */
const URL_PREFIX = '/uploads/demo';

/** Two clips, alternated, so a reviewer clicking through lessons sees variety. */
const VIDEO_FILES = ['flower.mp4', 'friday.mp4'] as const;

export const LESSON_VIDEO_URLS = VIDEO_FILES.map((f) => `${URL_PREFIX}/${f}`);
export const HERO_URL = `${URL_PREFIX}/hero.svg`;

export function courseThumbnailUrl(slug: string): string {
  return `${URL_PREFIX}/course-${slug}.svg`;
}

export function avatarUrl(key: string): string {
  return `${URL_PREFIX}/avatar-${key}.svg`;
}

// ── Palette ───────────────────────────────────────────────────────────────

interface Palette {
  from: string;
  to: string;
  accent: string;
}

/** One colour pair per category, so the catalogue reads as a designed set. */
const PALETTES: Record<string, Palette> = {
  programming: { from: '#4338ca', to: '#0ea5e9', accent: '#a5b4fc' },
  design: { from: '#be185d', to: '#f97316', accent: '#fbcfe8' },
  'business-marketing': { from: '#b45309', to: '#eab308', accent: '#fde68a' },
  'data-ai': { from: '#6d28d9', to: '#db2777', accent: '#ddd6fe' },
  'personal-development': { from: '#047857', to: '#14b8a6', accent: '#a7f3d0' },
  'it-software': { from: '#0f172a', to: '#0891b2', accent: '#67e8f9' },
};

const FALLBACK: Palette = { from: '#1e293b', to: '#475569', accent: '#cbd5e1' };

function paletteFor(category: string): Palette {
  return PALETTES[category] ?? FALLBACK;
}

// ── SVG helpers ───────────────────────────────────────────────────────────

/** SVG is XML: an unescaped `&` in a course title makes the file unparseable. */
function xml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Break a title into lines that fit the card. SVG has no text wrapping, so the
 * width is estimated from character count — approximate, but the card is sized
 * with enough slack that a wrong guess never clips.
 */
function wrap(text: string, maxChars: number, maxLines: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);

  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = `${kept[maxLines - 1]}…`;
    return kept;
  }
  return lines;
}

const FONT = "'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif";

// ── Course thumbnail ──────────────────────────────────────────────────────

export interface ThumbnailSpec {
  slug: string;
  title: string;
  category: string;
  categoryLabel: string;
  level: string;
}

/**
 * 1280x720 card — the 16:9 ratio the catalogue and course header both expect.
 *
 * Both surfaces that show this image put their own chrome on top of it: the
 * catalogue card overlays a discount badge at top-left and a level badge at
 * top-right, and both overlay a centred play button. So the artwork keeps the
 * top row and the centre completely clear and stacks everything along the
 * bottom, over a scrim that keeps the text readable on any gradient. Level is
 * omitted entirely — the card already renders it as a chip, and drawing it here
 * produced two overlapping copies of the same word.
 */
function courseThumbnailSvg(spec: ThumbnailSpec): string {
  const p = paletteFor(spec.category);
  const lines = wrap(spec.title, 26, 2);

  // Anchored to the bottom so one-line and two-line titles share a baseline.
  const lastLineY = 612;
  const titleLines = lines
    .map((line, i) => `<tspan x="80" y="${lastLineY - (lines.length - 1 - i) * 70}">${xml(line)}</tspan>`)
    .join('');
  const categoryY = lastLineY - (lines.length - 1) * 70 - 92;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720" role="img" aria-label="${xml(spec.title)}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${p.from}"/>
      <stop offset="100%" stop-color="${p.to}"/>
    </linearGradient>
    <linearGradient id="scrim" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#000000" stop-opacity="0"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0.5"/>
    </linearGradient>
  </defs>
  <rect width="1280" height="720" fill="url(#bg)"/>
  <g fill="#ffffff" opacity="0.07">
    <circle cx="1120" cy="120" r="240"/>
    <circle cx="140" cy="660" r="150"/>
  </g>
  <rect y="300" width="1280" height="420" fill="url(#scrim)"/>
  <text x="80" y="${categoryY}" font-family="${FONT}" font-size="26" font-weight="600" letter-spacing="4" fill="${p.accent}">${xml(spec.categoryLabel.toUpperCase())}</text>
  <text font-family="${FONT}" font-size="62" font-weight="700" fill="#ffffff">${titleLines}</text>
</svg>
`;
}

// ── Avatar ────────────────────────────────────────────────────────────────

/** Deterministic hue so the same person always gets the same colour. */
function hueFor(seed: string): number {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] ?? '')
    .join('')
    .toUpperCase();
}

function avatarSvg(name: string, seed: string): string {
  const hue = hueFor(seed);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400" role="img" aria-label="${xml(name)}">
  <defs>
    <linearGradient id="a" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="hsl(${hue},62%,52%)"/>
      <stop offset="100%" stop-color="hsl(${(hue + 45) % 360},68%,40%)"/>
    </linearGradient>
  </defs>
  <rect width="400" height="400" fill="url(#a)"/>
  <circle cx="200" cy="152" r="62" fill="#ffffff" opacity="0.92"/>
  <path d="M60 400c0-77 63-140 140-140s140 63 140 140z" fill="#ffffff" opacity="0.92"/>
  <text x="200" y="172" font-family="${FONT}" font-size="58" font-weight="700" fill="hsl(${hue},55%,32%)" text-anchor="middle">${xml(initialsOf(name))}</text>
</svg>
`;
}

// ── Hero ──────────────────────────────────────────────────────────────────

/**
 * Square, because the landing hero renders it in a fixed 384x384 rounded frame.
 * Without a seeded hero the landing page falls back to a bare gradient block,
 * which is what the storefront used to show.
 */
function heroSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800" role="img" aria-label="A lesson playing inside the course player">
  <defs>
    <linearGradient id="h" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#e11d48"/>
      <stop offset="55%" stop-color="#f97316"/>
      <stop offset="100%" stop-color="#facc15"/>
    </linearGradient>
  </defs>
  <rect width="800" height="800" fill="url(#h)"/>
  <g fill="#ffffff" opacity="0.10">
    <circle cx="660" cy="150" r="200"/>
    <circle cx="130" cy="690" r="160"/>
  </g>

  <!-- A laptop showing a lesson in progress: the product, not decoration. -->
  <g transform="translate(150 210)">
    <rect x="-40" y="272" width="580" height="20" rx="10" fill="#1e293b" opacity="0.92"/>
    <rect x="0" y="0" width="500" height="290" rx="18" fill="#0f172a" opacity="0.92"/>
    <rect x="22" y="24" width="456" height="228" rx="10" fill="#ffffff"/>
    <rect x="44" y="48" width="180" height="128" rx="8" fill="#e2e8f0"/>
    <polygon points="118,90 158,112 118,134" fill="#e11d48"/>
    <rect x="244" y="48" width="212" height="15" rx="7" fill="#cbd5e1"/>
    <rect x="244" y="76" width="168" height="15" rx="7" fill="#e2e8f0"/>
    <rect x="244" y="104" width="196" height="15" rx="7" fill="#e2e8f0"/>
    <rect x="244" y="140" width="120" height="34" rx="17" fill="#e11d48"/>
    <rect x="44" y="196" width="412" height="12" rx="6" fill="#e2e8f0"/>
    <rect x="44" y="196" width="264" height="12" rx="6" fill="#22c55e"/>
    <rect x="44" y="222" width="98" height="12" rx="6" fill="#f1f5f9"/>
  </g>
</svg>
`;
}

// ── Installer ─────────────────────────────────────────────────────────────

export interface DemoMediaInput {
  courses: ThumbnailSpec[];
  /** `key` becomes the filename; `name` drives the initials and colour. */
  people: Array<{ key: string; name: string }>;
}

/**
 * Write every demo asset into `uploads/demo/`. Idempotent — files are simply
 * overwritten, so re-seeding refreshes them.
 */
export async function installDemoMedia(input: DemoMediaInput): Promise<void> {
  await mkdir(DEST_DIR, { recursive: true });

  for (const file of VIDEO_FILES) {
    try {
      await copyFile(path.join(SRC_DIR, file), path.join(DEST_DIR, file));
    } catch (err) {
      // A missing clip must not abort the seed — every other asset still helps.
      logger.warn(
        { file, err },
        `Demo video ${file} not found in assets/demo — lessons will have no playable video`,
      );
    }
  }

  for (const course of input.courses) {
    await writeFile(path.join(DEST_DIR, `course-${course.slug}.svg`), courseThumbnailSvg(course), 'utf8');
  }

  for (const person of input.people) {
    await writeFile(path.join(DEST_DIR, `avatar-${person.key}.svg`), avatarSvg(person.name, person.key), 'utf8');
  }

  await writeFile(path.join(DEST_DIR, 'hero.svg'), heroSvg(), 'utf8');

  logger.info(
    `Demo media installed: ${input.courses.length} thumbnails, ${input.people.length} avatars, hero, ${VIDEO_FILES.length} videos`,
  );
}
