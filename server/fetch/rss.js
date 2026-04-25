/**
 * fetch/rss.js — RSS / Atom / Sitemap parser.
 *
 * Recognises RSS 2.0, Atom, sitemap urlset, sitemapindex. Returns null
 * if the XML doesn't look like any known feed format.
 *
 * Pure: no I/O. Depends only on parser.decodeEntities for text cleanup.
 *
 * Extracted from web-fetch.js (R6.7).
 */

"use strict";

const { decodeEntities } = require("./parser");

function parseRssAtom(xml) {
  if (!xml || typeof xml !== "string") return null;

  let type = null;
  if (/<rss[\s>]/i.test(xml))          type = "rss";
  else if (/<feed[\s>][^>]*xmlns/i.test(xml) || /<feed\b[\s\S]*?xmlns\s*=\s*["']http:\/\/www\.w3\.org\/2005\/Atom/i.test(xml)) type = "atom";
  else if (/<feed[\s>]/i.test(xml) && /<entry[\s>]/i.test(xml)) type = "atom";
  else if (/<urlset[\s>]/i.test(xml))  type = "sitemap";
  else if (/<sitemapindex[\s>]/i.test(xml)) type = "sitemapindex";
  else return null;

  const result = { type, title: null, description: null, link: null, items: [] };

  // Pre-process CDATA sections → plain text
  const clean = xml.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_, inner) => inner);

  // Feed-level metadata
  const chanMatch = clean.match(/<channel[\s>][\s\S]*?<\/channel\s*>/i);
  const chanScope = chanMatch ? chanMatch[0] : clean;
  result.title       = extractXmlTag(chanScope, "title")       || null;
  result.description = extractXmlTag(chanScope, "description") ||
                       extractXmlTag(chanScope, "subtitle")    || null;
  result.link        = extractXmlTag(chanScope, "link")        || null;

  if (type === "rss") {
    const itemRe = /<item\b[^>]*>([\s\S]*?)<\/item\s*>/gi;
    let m;
    while ((m = itemRe.exec(clean)) !== null) {
      const inner = m[1];
      result.items.push({
        title:       extractXmlTag(inner, "title"),
        link:        extractXmlTag(inner, "link"),
        description: extractXmlTag(inner, "description"),
        content:     extractXmlTag(inner, "content:encoded"),
        pubDate:     extractXmlTag(inner, "pubDate") || extractXmlTag(inner, "dc:date"),
        author:      extractXmlTag(inner, "author")  || extractXmlTag(inner, "dc:creator"),
        guid:        extractXmlTag(inner, "guid"),
        categories:  extractAllXmlTags(inner, "category")
      });
    }
  } else if (type === "atom") {
    const entryRe = /<entry\b[^>]*>([\s\S]*?)<\/entry\s*>/gi;
    let m;
    while ((m = entryRe.exec(clean)) !== null) {
      const inner = m[1];
      let link = null;
      const linkMatch = inner.match(/<link\b[^>]*href\s*=\s*["']([^"']+)["']/i);
      if (linkMatch) link = linkMatch[1];
      else link = extractXmlTag(inner, "link");
      result.items.push({
        title:     extractXmlTag(inner, "title"),
        link,
        summary:   extractXmlTag(inner, "summary"),
        content:   extractXmlTag(inner, "content"),
        updated:   extractXmlTag(inner, "updated"),
        published: extractXmlTag(inner, "published"),
        id:        extractXmlTag(inner, "id"),
        author:    extractXmlTag(inner, "name") || extractXmlTag(inner, "author")
      });
    }
  } else if (type === "sitemap") {
    const urlRe = /<url\b[^>]*>([\s\S]*?)<\/url\s*>/gi;
    let m;
    while ((m = urlRe.exec(clean)) !== null) {
      const inner = m[1];
      result.items.push({
        loc:        extractXmlTag(inner, "loc"),
        lastmod:    extractXmlTag(inner, "lastmod"),
        changefreq: extractXmlTag(inner, "changefreq"),
        priority:   extractXmlTag(inner, "priority")
      });
    }
  } else if (type === "sitemapindex") {
    const smRe = /<sitemap\b[^>]*>([\s\S]*?)<\/sitemap\s*>/gi;
    let m;
    while ((m = smRe.exec(clean)) !== null) {
      const inner = m[1];
      result.items.push({
        loc:     extractXmlTag(inner, "loc"),
        lastmod: extractXmlTag(inner, "lastmod")
      });
    }
  }

  result.itemCount = result.items.length;
  return result;
}

function extractXmlTag(xml, tag) {
  const tagRe = tag.replace(/[:.-]/g, "\\$&");
  const re = new RegExp("<" + tagRe + "\\b[^>]*>([\\s\\S]*?)<\\/" + tagRe + "\\s*>", "i");
  const m = xml.match(re);
  if (!m) {
    // Try self-closing variant (e.g., <link href="..."/>)
    const selfRe = new RegExp("<" + tagRe + "\\b([^>]*)\\/>", "i");
    const sm = xml.match(selfRe);
    if (sm) {
      const hrefMatch = sm[1].match(/href\s*=\s*["']([^"']+)["']/i);
      if (hrefMatch) return hrefMatch[1];
    }
    return null;
  }
  return cleanXmlText(m[1]);
}

function extractAllXmlTags(xml, tag) {
  const tagRe = tag.replace(/[:.-]/g, "\\$&");
  const re = new RegExp("<" + tagRe + "\\b[^>]*>([\\s\\S]*?)<\\/" + tagRe + "\\s*>", "gi");
  const results = [];
  let m;
  while ((m = re.exec(xml)) !== null) {
    const v = cleanXmlText(m[1]);
    if (v) results.push(v);
  }
  return results;
}

function cleanXmlText(s) {
  return decodeEntities(
    s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]+>/g, "")
  ).trim();
}

module.exports = { parseRssAtom, extractXmlTag, extractAllXmlTags, cleanXmlText };
