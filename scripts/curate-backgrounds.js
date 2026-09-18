#!/usr/bin/env node
/**
 * One-off curation script for the background gallery. Not used at runtime —
 * run it by hand when the gallery needs refreshing, commit the output.
 *
 * Writes optimised JPEGs plus a manifest to server/assets/backgrounds/.
 * That path matters: server/data is a Docker *volume* on the droplet, so
 * anything shipped there is shadowed by the existing volume and would never
 * update. server/assets is plain image content, so a rebuild picks it up.
 *
 * Images come from two places:
 *  - stills pulled out of the heavy GIF/MP4 backgrounds we're retiring, so
 *    those looks survive at ~200KB instead of 80MB
 *  - the Unsplash API, same client pattern as the Forbes project
 *
 * Usage:  UNSPLASH_ACCESS_KEY=xxx node scripts/curate-backgrounds.js
 *         (falls back to reading the key from the Forbes project's .env.local)
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'server', 'assets', 'backgrounds');
const SRC_DIR = path.join(ROOT, 'public', 'backgrounds');
const FULL_WIDTH = 1920;
const THUMB_WIDTH = 320;

// Kept from the existing set: only images that still look acceptable scaled
// up to a widescreen monitor. The rest of the old assets are 1024x1024
// AI stills that go soft when stretched, so they're being retired.
const KEEP_EXISTING = [
  { id: 'lavender-gradient', name: 'Lavender Gradient', file: 'lavender-gradient.jpg', vibe: 'abstract' },
  { id: 'bokeh-foliage', name: 'Bokeh Foliage', file: 'bokeh-foliage.jpg', vibe: 'abstract' },
];

// Frame grabs from the animated backgrounds we're dropping. Cabin.mp4 is
// 4K, so it makes a genuinely good still.
//
// Only one survives the cull: the water GIF turned out to be an animated
// version of this same cabin-by-the-lake shot (near-identical still), and
// of the others, dolly-in.mp4 has a "Veo" generator watermark burned into
// the corner and the sky GIF is only 320x480.
const STILLS = [
  { id: 'cosy-cabin', name: 'Cabin by the Lake', src: 'Cabin.mp4', at: '00:00:02', vibe: 'nature' },
];

// Two per vibe, so all four are represented without the picker needing to scroll.
const SEARCHES = [
  { id: 'misty-forest', vibe: 'nature', query: 'misty forest morning fog landscape' },
  { id: 'calm-lake', vibe: 'nature', query: 'calm lake mountains reflection' },
  { id: 'study-desk', vibe: 'interior', query: 'cosy study desk by window warm light' },
  { id: 'reading-room', vibe: 'interior', query: 'warm library reading room bookshelves' },
  { id: 'plant-room', vibe: 'interior', query: 'bright room houseplants morning light calm' },
  { id: 'soft-gradient', vibe: 'abstract', query: 'soft pastel gradient minimal background' },
  { id: 'muted-texture', vibe: 'abstract', query: 'minimal muted texture abstract calm' },
  { id: 'starry-night', vibe: 'night', query: 'starry night sky mountains long exposure' },
  { id: 'moody-forest', vibe: 'night', query: 'dark moody forest night low light' },
];

function unsplashKey() {
  if (process.env.UNSPLASH_ACCESS_KEY) return process.env.UNSPLASH_ACCESS_KEY;
  // Reuse the key already configured in the Forbes project rather than
  // asking for a new one.
  const envPath = '/Users/sskmusic/Forbes Website/.env.local';
  if (fs.existsSync(envPath)) {
    const match = fs.readFileSync(envPath, 'utf8').match(/^UNSPLASH_ACCESS_KEY=(.+)$/m);
    if (match) return match[1].trim().replace(/^["']|["']$/g, '');
  }
  return null;
}

function ffmpeg(args) {
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args]);
}

// Re-running shouldn't silently swap images that have already been eyeballed
// and approved — a search can return different photos later. Only fetch what's
// missing unless FORCE=1.
function alreadyHave(id) {
  return !process.env.FORCE && fs.existsSync(path.join(OUT_DIR, `${id}.jpg`));
}

function existingEntry(id) {
  const manifestPath = path.join(OUT_DIR, 'manifest.json');
  if (!fs.existsSync(manifestPath)) return null;
  const { backgrounds } = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  return backgrounds.find(b => b.id === id) || null;
}

// One source image in, a full-size and a thumbnail out.
function writeVariants(sourcePath, id) {
  const full = path.join(OUT_DIR, `${id}.jpg`);
  const thumb = path.join(OUT_DIR, `${id}-thumb.jpg`);
  ffmpeg(['-i', sourcePath, '-vf', `scale=${FULL_WIDTH}:-2`, '-q:v', '4', full]);
  ffmpeg(['-i', sourcePath, '-vf', `scale=${THUMB_WIDTH}:-2`, '-q:v', '5', thumb]);
  return {
    file: path.basename(full),
    thumb: path.basename(thumb),
    bytes: fs.statSync(full).size + fs.statSync(thumb).size,
  };
}

async function fetchFromUnsplash(key, spec, usedIds) {
  const searchUrl = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(spec.query)}&per_page=5&orientation=landscape&content_filter=high`;
  const res = await fetch(searchUrl, { headers: { Authorization: `Client-ID ${key}` } });
  if (!res.ok) throw new Error(`search failed (${res.status})`);

  const { results } = await res.json();
  const photo = results.find(p => !usedIds.has(p.id));
  if (!photo) throw new Error('no unused result');
  usedIds.add(photo.id);

  // Unsplash's API guidelines require pinging this when a photo is actually
  // taken, so photographers get credited with the download.
  fetch(`${photo.links.download_location}?client_id=${key}`).catch(() => {});

  const imgUrl = `${photo.urls.raw}&w=${FULL_WIDTH}&q=85&fm=jpg&fit=max`;
  const imgRes = await fetch(imgUrl);
  if (!imgRes.ok) throw new Error(`download failed (${imgRes.status})`);

  const tmp = path.join(OUT_DIR, `.tmp-${spec.id}.jpg`);
  fs.writeFileSync(tmp, Buffer.from(await imgRes.arrayBuffer()));
  const variants = writeVariants(tmp, spec.id);
  fs.unlinkSync(tmp);

  return {
    ...variants,
    name: (photo.description || photo.alt_description || spec.query)
      .split(' ').slice(0, 4).map(w => w[0].toUpperCase() + w.slice(1)).join(' '),
    credit: { photographer: photo.user.name, url: photo.user.links.html, source: 'Unsplash' },
  };
}

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const entries = [];

  for (const item of KEEP_EXISTING) {
    const src = path.join(SRC_DIR, item.file);
    if (!fs.existsSync(src)) { console.log(`skip ${item.id} (missing)`); continue; }
    const v = writeVariants(src, item.id);
    entries.push({ id: item.id, name: item.name, vibe: item.vibe, ...v });
    console.log(`kept   ${item.id} (${Math.round(v.bytes / 1024)}KB)`);
  }

  for (const item of STILLS) {
    const src = path.join(SRC_DIR, item.src);
    if (!fs.existsSync(src)) { console.log(`skip ${item.id} (missing source)`); continue; }
    const tmp = path.join(OUT_DIR, `.tmp-${item.id}.png`);
    try {
      ffmpeg(['-ss', item.at, '-i', src, '-frames:v', '1', tmp]);
    } catch {
      ffmpeg(['-i', src, '-frames:v', '1', tmp]); // GIFs may be shorter than the seek
    }
    const v = writeVariants(tmp, item.id);
    fs.unlinkSync(tmp);
    entries.push({ id: item.id, name: item.name, vibe: item.vibe, ...v });
    console.log(`still  ${item.id} (${Math.round(v.bytes / 1024)}KB)`);
  }

  const key = unsplashKey();
  if (!key) {
    console.log('\nNo UNSPLASH_ACCESS_KEY found — skipping the searched images.');
  } else {
    const usedIds = new Set();
    for (const spec of SEARCHES) {
      const kept = alreadyHave(spec.id) && existingEntry(spec.id);
      if (kept) {
        entries.push(kept);
        console.log(`have   ${spec.id} (unchanged)`);
        continue;
      }
      try {
        const v = await fetchFromUnsplash(key, spec, usedIds);
        entries.push({ id: spec.id, vibe: spec.vibe, ...v });
        console.log(`pulled ${spec.id} (${Math.round(v.bytes / 1024)}KB) — ${v.credit.photographer}`);
      } catch (err) {
        console.log(`FAILED ${spec.id}: ${err.message}`);
      }
    }
  }

  fs.writeFileSync(
    path.join(OUT_DIR, 'manifest.json'),
    JSON.stringify({ updated: new Date().toISOString(), backgrounds: entries }, null, 2)
  );

  const total = entries.reduce((sum, e) => sum + e.bytes, 0);
  console.log(`\n${entries.length} backgrounds, ${(total / 1024 / 1024).toFixed(1)}MB total`);
})();
