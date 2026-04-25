/**
 * build/thumb.js — post-build thumbnail capture + diff against previous build.
 *
 * Fire-and-forget: scheduled after a successful build, lazily requires
 * the browser module so the build pipeline doesn't pull in playwright on
 * load. Silent when the browser is unavailable.
 *
 * Owns the LRU cap on resident thumbs (DV_MAX_THUMBS, default 40); when
 * a new thumb is stored, oldest are evicted along with their diff data.
 *
 * Extracted from build.js (R6.6).
 */

"use strict";

const { buildStatus } = require("./state");

const MAX_THUMBS = parseInt(process.env.DV_MAX_THUMBS, 10) || 40;

function evictThumbsIfNeeded() {
  const withThumbs = [];
  for (const k in buildStatus) { if (buildStatus[k] && buildStatus[k].thumb) withThumbs.push({ k, at: buildStatus[k].thumbAt || 0 }); }
  if (withThumbs.length <= MAX_THUMBS) return;
  withThumbs.sort(function(a, b) { return a.at - b.at; }); // oldest first
  const evict = withThumbs.length - MAX_THUMBS;
  for (let i = 0; i < evict; i++) {
    const slot = buildStatus[withThumbs[i].k];
    if (!slot) continue;
    delete slot.thumb;
    delete slot.diffThumb;
    delete slot.diff;             // diff is meaningless without the thumb it was computed from
    delete slot.previousThumbAt;
  }
}

function captureThumbAsync(owner, repo, slug, delayMs) {
  setTimeout(async () => {
    try {
      const browser = require("../browser");
      if (!browser.hasPlaywright || !browser.hasPlaywright()) return;
      const shot = await browser.takeScreenshot({
        owner, repo, slug, width: 1024, height: 640, fullPage: false
      });
      if (!shot || !shot.base64 || shot.error) return;

      const key = owner + "/" + repo + ":" + slug;
      if (!buildStatus[key]) return;

      const previous = buildStatus[key].thumb;
      buildStatus[key].thumb = shot.base64;
      buildStatus[key].thumbAt = Date.now();
      evictThumbsIfNeeded();

      // Run a quick pixel diff against the previous thumb, best-effort.
      if (previous && typeof browser.screenshotDiff === "function") {
        try {
          const diff = await browser.screenshotDiff({
            before: previous,
            after: shot.base64,
            threshold: 10
          });
          if (diff && !diff.error) {
            buildStatus[key].diff = {
              diffCount: diff.diffCount,
              percent: diff.percent,
              bbox: diff.bbox,
              engine: diff.engine || null,
              previousThumbAt: buildStatus[key].previousThumbAt || null,
              at: Date.now()
            };
            if (diff.base64) buildStatus[key].diffThumb = diff.base64;
          }
        } catch (_) { /* diffing is best-effort */ }
      }
      buildStatus[key].previousThumbAt = buildStatus[key].thumbAt;
    } catch (_) { /* silent — thumbs are nice-to-have */ }
  }, delayMs || 1500);
}

module.exports = { evictThumbsIfNeeded, captureThumbAsync, MAX_THUMBS };
