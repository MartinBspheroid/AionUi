#!/usr/bin/env node
/**
 * Static check that guards against runaway file sizes.
 *
 * The repo already enforces a 10-children-per-directory rule, but until now
 * nothing stopped logic from concentrating in multi-thousand-line "god files".
 * This guard adds the missing dimension:
 *
 *   - lines > WARN_LIMIT   → warning (does not fail the build)
 *   - lines > ERROR_LIMIT  → error   (fails the build), unless grandfathered
 *
 * Existing oversized files are listed in GRANDFATHERED so the guard can land
 * without a flag-day refactor. The list is a ratchet: when a grandfathered file
 * is split below the limit, the guard tells you to remove it from the list, so
 * the debt can only shrink. Do NOT add new entries — split the file instead.
 *
 * Exit 0 if clean (warnings allowed), exit 1 if any hard violation is found.
 *
 * Usage: node scripts/check-file-size.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SCAN_ROOTS = ['packages/desktop/src', 'packages/web-host/src', 'packages/web-cli/src'];

const WARN_LIMIT = 600;
const ERROR_LIMIT = 1000;

// Files allowed to exceed ERROR_LIMIT for now. Split them and remove the entry.
// Paths are repo-relative with POSIX separators.
const GRANDFATHERED = new Set([
  'packages/desktop/src/renderer/components/chat/SendBox/index.tsx',
  'packages/desktop/src/process/services/database/migrations.ts',
]);

// Skip generated declarations and test files — neither is hand-maintained
// application code subject to the structure rules.
function isExempt(relPath) {
  return /\.d\.ts$/.test(relPath) || /\.(test|spec|bench)\.(ts|tsx)$/.test(relPath);
}

function* walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full);
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      yield full;
    }
  }
}

const warnings = [];
const errors = [];
const staleGrandfathers = new Set(GRANDFATHERED);

for (const scanRoot of SCAN_ROOTS) {
  for (const file of walk(path.join(ROOT, scanRoot))) {
    const rel = path.relative(ROOT, file).split(path.sep).join('/');
    if (isExempt(rel)) continue;

    const lines = fs.readFileSync(file, 'utf8').split('\n').length;
    const grandfathered = GRANDFATHERED.has(rel);

    if (lines > ERROR_LIMIT) {
      if (grandfathered) {
        staleGrandfathers.delete(rel); // still oversized → legitimately listed
      } else {
        errors.push(`${rel}: ${lines} lines exceeds hard limit of ${ERROR_LIMIT}`);
      }
    } else if (grandfathered) {
      // Listed but now under the limit → the list is stale.
      staleGrandfathers.delete(rel);
      warnings.push(
        `${rel}: ${lines} lines is now under ${ERROR_LIMIT} — remove it from GRANDFATHERED in scripts/check-file-size.js`
      );
    } else if (lines > WARN_LIMIT) {
      warnings.push(
        `${rel}: ${lines} lines exceeds soft limit of ${WARN_LIMIT} — consider splitting by responsibility`
      );
    }
  }
}

// Any grandfathered entry we never encountered points at a moved/deleted file.
for (const rel of staleGrandfathers) {
  warnings.push(
    `${rel}: listed in GRANDFATHERED but not found — remove the stale entry from scripts/check-file-size.js`
  );
}

for (const w of warnings) console.warn(`warning: ${w}`);
for (const e of errors) console.error(`error: ${e}`);

if (errors.length > 0) {
  console.error(
    `\ncheck-file-size: ${errors.length} file(s) over the ${ERROR_LIMIT}-line hard limit. Split them by responsibility (see .claude/skills/architecture).`
  );
  process.exit(1);
}
console.log(`check-file-size: OK (${warnings.length} warning(s))`);
