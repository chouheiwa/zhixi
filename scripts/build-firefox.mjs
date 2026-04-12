// @ts-check
/**
 * Firefox post-build script.
 *
 * Takes the Chrome MV3 output from `dist/` (produced by @crxjs/vite-plugin)
 * and transforms it into a Firefox-compatible MV3 extension in `dist-firefox/`:
 *
 * 1. Copies `dist/` → `dist-firefox/` (dashboard, popup, icons, assets…)
 * 2. Re-bundles the service worker **from TypeScript source** with esbuild
 *    into a single classic-script IIFE `background.js`. This deliberately
 *    bypasses Vite's manualChunks output because that output contains
 *    cross-chunk side-effect imports (`import "./antd-XXX.js"`) which
 *    would drag the entire antd chunk into the SW bundle. Re-bundling from
 *    source gives us a minimal, self-contained SW tailored to Firefox 115
 *    (which does not support `background.type: "module"`).
 * 3. Rewrites `manifest.json` to use `background.scripts` and injects
 *    `browser_specific_settings.gecko`.
 * 4. Prunes the now-redundant loader and SW chunk files from dist-firefox/.
 * 5. Writes `.build-info.json` for AMO reviewer reproducibility.
 *
 * Run via `yarn build:firefox` (which chains `yarn build && node scripts/build-firefox.mjs`).
 */

import { execSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as esbuildBuild } from 'esbuild';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');
const DIST = join(ROOT, 'dist');
const DIST_FF = join(ROOT, 'dist-firefox');
const SW_SOURCE = join(ROOT, 'src/background/service-worker.ts');
const TSCONFIG = join(ROOT, 'tsconfig.json');

const GECKO_ID = 'zhixi@chouheiwa.dev';
const GECKO_MIN_VERSION = '115.0';

/** @param {string} msg */
function log(msg) {
  console.log(`[build-firefox] ${msg}`);
}

/**
 * @param {string} msg
 * @returns {never}
 */
function fail(msg) {
  console.error(`[build-firefox] ERROR: ${msg}`);
  process.exit(1);
}

// ---------- Step 1: pre-flight ----------
if (!existsSync(DIST)) {
  fail(`dist/ not found. Run \`yarn build\` first.`);
}
if (!existsSync(join(DIST, 'manifest.json'))) {
  fail(`dist/manifest.json missing.`);
}
if (!existsSync(SW_SOURCE)) {
  fail(`service worker source not found: ${relative(ROOT, SW_SOURCE)}`);
}

// ---------- Step 2: mirror dist → dist-firefox ----------
if (existsSync(DIST_FF)) {
  log('Cleaning dist-firefox/ …');
  rmSync(DIST_FF, { recursive: true, force: true });
}
mkdirSync(DIST_FF, { recursive: true });
log('Copying dist/ → dist-firefox/ …');
cpSync(DIST, DIST_FF, { recursive: true });

// ---------- Step 3: re-bundle service worker from source ----------
log('Bundling service worker from source (src/background/service-worker.ts) …');
const backgroundOut = join(DIST_FF, 'background.js');

const result = await esbuildBuild({
  entryPoints: [SW_SOURCE],
  outfile: backgroundOut,
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['firefox115'],
  // AMO reviewers require readable, non-obfuscated source in the submitted zip.
  minify: false,
  // Inline sourcemap helps debugging inside Firefox devtools and doesn't
  // meaningfully bloat the xpi.
  sourcemap: 'inline',
  // Honor the project's TS path alias `@/* -> src/*`.
  tsconfig: TSCONFIG,
  absWorkingDir: ROOT,
  logLevel: 'info',
  metafile: true,
}).catch((err) => {
  console.error(err);
  fail('esbuild failed while bundling service worker.');
});

// Sanity check: the SW bundle must not pull in UI libraries. If it does, some
// import in service-worker.ts (or a transitive import) accidentally reaches
// into UI territory — fail loudly so we notice before shipping to AMO.
const bannedModules = ['antd', 'echarts', '@ant-design/icons', 'react', 'react-dom'];
const inputs = Object.keys(result.metafile?.inputs ?? {});
const leaked = bannedModules.filter((mod) =>
  inputs.some((p) => p.includes(`node_modules/${mod}/`)),
);
if (leaked.length > 0) {
  fail(
    `service worker bundle unexpectedly pulled in UI libraries: ${leaked.join(', ')}. ` +
      `Check recent imports in src/background/ or src/shared/ for stray UI references.`,
  );
}

// ---------- Step 4: rewrite manifest ----------
log('Rewriting manifest.json for Firefox …');
const manifestPath = join(DIST_FF, 'manifest.json');
/** @type {Record<string, unknown>} */
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

manifest.background = {
  scripts: ['background.js'],
};

manifest.browser_specific_settings = {
  gecko: {
    id: GECKO_ID,
    strict_min_version: GECKO_MIN_VERSION,
  },
};

writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

// ---------- Step 5: drop redundant Chrome-side SW artifacts ----------
log('Removing now-redundant loader and service-worker chunks …');
rmSync(join(DIST_FF, 'service-worker-loader.js'), { force: true });

const ffAssetsDir = join(DIST_FF, 'assets');
if (existsSync(ffAssetsDir)) {
  for (const name of readdirSync(ffAssetsDir)) {
    // @crxjs emits the SW chunk as `service-worker.ts-<hash>.js`. The
    // dashboard/popup chunks (dashboard-*, echarts-*, antd-*, tfjs-*, etc.)
    // must stay because they're consumed by the HTML entry points.
    if (name.startsWith('service-worker.ts-') && name.endsWith('.js')) {
      rmSync(join(ffAssetsDir, name), { force: true });
      log(`  pruned assets/${name}`);
    }
  }
}

// ---------- Step 6: write build-info for AMO reviewers ----------
let gitSha = 'unknown';
try {
  gitSha = execSync('git rev-parse HEAD', { cwd: ROOT }).toString().trim();
} catch {
  // not a git checkout; leave as "unknown"
}

const buildInfo = {
  product: 'zhixi-firefox',
  built_at: new Date().toISOString(),
  git_sha: gitSha,
  node_version: process.version,
  gecko_id: GECKO_ID,
  gecko_min_version: GECKO_MIN_VERSION,
  reproduce: ['yarn install --frozen-lockfile', 'yarn build:firefox'],
};
writeFileSync(join(DIST_FF, '.build-info.json'), `${JSON.stringify(buildInfo, null, 2)}\n`);

log(`Done. Output: ${relative(ROOT, DIST_FF)}/`);
