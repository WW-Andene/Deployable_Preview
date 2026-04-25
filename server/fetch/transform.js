/**
 * fetch/transform.js — HTML → Markdown converter.
 *
 * Regex-based — not perfect but handles 95% of real-world HTML:
 * headings, paragraphs, links, images, lists, code blocks, blockquotes,
 * emphasis, tables. Used by web_fetch when format:"markdown".
 *
 * Extracted from web-fetch.js (R6.7).
 */

"use strict";

const { stripScripts, decodeEntities } = require("./parser");

function htmlToMarkdown(rawHtml, baseUrl, maxLen) {
  let html = rawHtml;

  // Strip script/style/noscript/svg/iframe completely
  html = stripScripts(html);
  html = html.replace(/<style\b[^<]*(?:(?!<\/style)<[^<]*)*<\/style\s*>/gi, "");
  html = html.replace(/<noscript\b[^<]*(?:(?!<\/noscript)<[^<]*)*<\/noscript\s*>/gi, "");
  html = html.replace(/<svg\b[^<]*(?:(?!<\/svg)<[^<]*)*<\/svg\s*>/gi, "");
  html = html.replace(/<iframe\b[^<]*(?:(?!<\/iframe)<[^<]*)*<\/iframe\s*>/gi, "");
  html = html.replace(/<!--[\s\S]*?-->/g, "");

  // Code blocks — <pre><code>...</code></pre> → ```\n...\n```
  html = html.replace(/<pre[^>]*>\s*<code[^>]*>([\s\S]*?)<\/code>\s*<\/pre>/gi, (_, inner) =>
    "\n\n```\n" + decodeEntities(inner.replace(/<[^>]+>/g, "")) + "\n```\n\n");
  html = html.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, (_, inner) =>
    "\n\n```\n" + decodeEntities(inner.replace(/<[^>]+>/g, "")) + "\n```\n\n");

  // Inline code
  html = html.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, (_, inner) =>
    "`" + decodeEntities(inner.replace(/<[^>]+>/g, "")).replace(/`/g, "\\`") + "`");

  // Headings — process h6 first so they don't get partially matched by h1 regex
  for (let level = 6; level >= 1; level--) {
    const re = new RegExp("<h" + level + "\\b[^>]*>([\\s\\S]*?)<\\/h" + level + "\\s*>", "gi");
    const prefix = "\n\n" + "#".repeat(level) + " ";
    html = html.replace(re, (_, inner) => prefix + collapseInlineText(inner) + "\n\n");
  }

  // Horizontal rule
  html = html.replace(/<hr\b[^>]*\/?>/gi, "\n\n---\n\n");

  // Line break
  html = html.replace(/<br\b[^>]*\/?>/gi, "  \n");

  // Images — ![alt](src)
  html = html.replace(/<img\b[^>]*>/gi, (tag) => {
    const srcMatch = tag.match(/src\s*=\s*["']([^"']+)["']/i);
    if (!srcMatch) return "";
    const altMatch = tag.match(/alt\s*=\s*["']([^"']*)["']/i);
    const alt = altMatch ? altMatch[1] : "";
    let src = srcMatch[1];
    try { src = new URL(src, baseUrl).href; } catch (_) {}
    const scheme = src.split(":")[0].toLowerCase();
    if (scheme === "javascript" || scheme === "vbscript" || scheme === "data") return "";
    return "![" + alt + "](" + src + ")";
  });

  // Links — [text](href)
  html = html.replace(/<a\s[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, href, text) => {
    let resolved = href;
    try { resolved = new URL(href, baseUrl).href; } catch (_) {}
    const scheme = resolved.split(":")[0].toLowerCase();
    if (scheme === "javascript" || scheme === "vbscript") return collapseInlineText(text);
    const label = collapseInlineText(text).trim();
    if (!label) return resolved;
    return "[" + label + "](" + resolved + ")";
  });

  // Emphasis — must run after link extraction so we don't break link text formatting
  html = html.replace(/<(strong|b)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi, (_, _t, inner) => "**" + collapseInlineText(inner) + "**");
  html = html.replace(/<(em|i)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi, (_, _t, inner) => "*" + collapseInlineText(inner) + "*");
  html = html.replace(/<del\b[^>]*>([\s\S]*?)<\/del\s*>/gi, (_, inner) => "~~" + collapseInlineText(inner) + "~~");

  // Lists
  html = html.replace(/<li\b[^>]*>([\s\S]*?)<\/li\s*>/gi, (_, inner) => "\n- " + collapseInlineText(inner).trim());
  html = html.replace(/<\/?(ul|ol|menu)\b[^>]*>/gi, "\n");

  // Blockquote
  html = html.replace(/<blockquote\b[^>]*>([\s\S]*?)<\/blockquote\s*>/gi, (_, inner) => {
    const text = collapseInlineText(inner).trim();
    if (!text) return "";
    return "\n\n> " + text.split(/\n+/).join("\n> ") + "\n\n";
  });

  // Tables — simple row-based conversion
  html = html.replace(/<table\b[^>]*>([\s\S]*?)<\/table\s*>/gi, (_, tableHtml) => {
    const rows = [];
    const rowRe = /<tr\b[^>]*>([\s\S]*?)<\/tr\s*>/gi;
    let rm;
    while ((rm = rowRe.exec(tableHtml)) !== null) {
      const cells = [];
      const cellRe = /<(?:td|th)\b[^>]*>([\s\S]*?)<\/(?:td|th)\s*>/gi;
      let cm;
      while ((cm = cellRe.exec(rm[1])) !== null) {
        cells.push(collapseInlineText(cm[1]).trim() || " ");
      }
      if (cells.length) rows.push("| " + cells.join(" | ") + " |");
    }
    if (!rows.length) return "";
    const sep = rows[0].split("|").length - 2;
    const separator = "| " + Array(sep).fill("---").join(" | ") + " |";
    return "\n\n" + rows[0] + "\n" + separator + "\n" + rows.slice(1).join("\n") + "\n\n";
  });

  // Paragraphs & block containers → line breaks
  html = html.replace(/<p\b[^>]*>([\s\S]*?)<\/p\s*>/gi, (_, inner) => "\n\n" + collapseInlineText(inner) + "\n\n");
  html = html.replace(/<\/?(div|section|article|main|header|footer|nav|aside|figure|figcaption|details|summary|dd|dt|dl|form|fieldset)\b[^>]*>/gi, "\n");

  // Strip any remaining tags
  html = html.replace(/<[^>]+>/g, "");

  // Decode entities
  html = decodeEntities(html);

  // Normalize whitespace
  html = html.replace(/\r/g, "");
  html = html.replace(/[ \t]+/g, " ");
  html = html.replace(/[ \t]+\n/g, "\n");
  html = html.replace(/\n[ \t]+/g, "\n");
  html = html.replace(/\n{3,}/g, "\n\n");
  html = html.trim();

  if (maxLen && html.length > maxLen) {
    html = html.slice(0, maxLen) + "\n\n[... truncated at " + maxLen + " characters]";
  }
  return html;
}

function collapseInlineText(s) {
  return decodeEntities(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

module.exports = { htmlToMarkdown, collapseInlineText };
