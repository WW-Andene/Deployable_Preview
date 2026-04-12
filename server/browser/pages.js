// browser/pages.js – list and close browser pages / tabs
const session = require("../dv/session");

async function listPages() {
  if (!session.hasPlaywright()) return { error: "No browser available." };
  const browser = await session.getBrowser();
  let pages = [];
  try {
    if (typeof browser.pages === "function") {
      pages = await browser.pages();
    } else if (browser.contexts && typeof browser.contexts === "function") {
      for (const c of browser.contexts()) {
        if (typeof c.pages === "function") pages = pages.concat(await c.pages());
      }
    }
  } catch (e) {
    return { error: "listPages failed: " + e.message };
  }
  const out = [];
  for (let i = 0; i < pages.length; i++) {
    const p = pages[i];
    let pUrl = "";
    let pTitle = "";
    try { pUrl = typeof p.url === "function" ? p.url() : ""; } catch (_) {}
    try { pTitle = await p.title(); } catch (_) {}
    out.push({ index: i, url: pUrl, title: pTitle });
  }
  return { count: out.length, pages: out };
}

async function closePage(opts) {
  if (!session.hasPlaywright()) return { error: "No browser available." };
  const browser = await session.getBrowser();
  let pages = [];
  try {
    if (typeof browser.pages === "function") pages = await browser.pages();
    else if (browser.contexts && typeof browser.contexts === "function") {
      for (const c of browser.contexts()) {
        if (typeof c.pages === "function") pages = pages.concat(await c.pages());
      }
    }
  } catch (e) { return { error: e.message }; }

  let target = null;
  if (Number.isFinite(opts && opts.index)) {
    target = pages[opts.index];
  } else if (opts && opts.urlContains) {
    target = pages.find((p) => {
      try { return (p.url() || "").includes(opts.urlContains); } catch (_) { return false; }
    });
  }
  if (!target) return { error: "no matching page" };
  try {
    await target.close();
    return { closed: true };
  } catch (e) {
    return { error: "close failed: " + e.message };
  }
}

module.exports = { listPages, closePage };
