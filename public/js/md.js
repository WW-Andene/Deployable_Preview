// md.js — minimal safe markdown → DOM renderer for repo READMEs.
//
// Subset supported: headings (# … ######), bold, italic, inline code,
// code blocks (``` fenced), links, unordered + ordered lists, hr,
// paragraphs, line breaks, blockquotes. No raw HTML pass-through —
// every `<` is escaped before parsing so injected HTML stays inert.
//
// Why hand-roll: real markdown libs are 50–200KB. DV stays at ~3KB
// of additional client JS for "good enough" README rendering.
(function(){
  "use strict";

  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // Inline pass — operates on already-HTML-escaped strings.
  function inline(s) {
    // Code spans first so ** inside them survives.
    s = s.replace(/`([^`]+?)`/g, function(_, c){ return '<code>' + c + '</code>'; });
    // Bold + italic.
    s = s.replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/(?:^|[\s(])\*([^*\s][^*]*?)\*(?=[\s)\.,!?]|$)/g, function(m, c, off){
      return m.charAt(0) + '<em>' + c + '</em>';
    });
    // Links — accept http(s) and relative; strip javascript:.
    s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, function(_, label, href){
      var clean = href.trim();
      if (/^javascript:/i.test(clean)) return label;
      return '<a href="' + clean + '" target="_blank" rel="noopener noreferrer">' + label + '</a>';
    });
    return s;
  }

  function render(md) {
    if (!md) return "";
    // Normalize line endings + escape HTML up front.
    var lines = String(md).replace(/\r\n?/g, "\n").split("\n").map(esc);
    var out = [];
    var i = 0;
    while (i < lines.length) {
      var line = lines[i];
      // Code fence
      if (/^```/.test(line)) {
        i++;
        var buf = [];
        while (i < lines.length && !/^```/.test(lines[i])) { buf.push(lines[i]); i++; }
        out.push('<pre class="md-code"><code>' + buf.join("\n") + '</code></pre>');
        i++; continue;
      }
      // Heading
      var hm = line.match(/^(#{1,6})\s+(.+)$/);
      if (hm) {
        var lvl = hm[1].length;
        out.push('<h' + lvl + ' class="md-h md-h' + lvl + '">' + inline(hm[2]) + '</h' + lvl + '>');
        i++; continue;
      }
      // Horizontal rule
      if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
        out.push('<hr class="md-hr"/>');
        i++; continue;
      }
      // Blockquote
      if (/^&gt;\s*/.test(line)) {
        var q = [];
        while (i < lines.length && /^&gt;\s*/.test(lines[i])) { q.push(lines[i].replace(/^&gt;\s?/, "")); i++; }
        out.push('<blockquote class="md-quote">' + inline(q.join(" ")) + '</blockquote>');
        continue;
      }
      // Unordered list
      if (/^\s*[-*+]\s+/.test(line)) {
        var u = [];
        while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
          u.push('<li>' + inline(lines[i].replace(/^\s*[-*+]\s+/, "")) + '</li>');
          i++;
        }
        out.push('<ul class="md-list">' + u.join("") + '</ul>');
        continue;
      }
      // Ordered list
      if (/^\s*\d+\.\s+/.test(line)) {
        var o = [];
        while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
          o.push('<li>' + inline(lines[i].replace(/^\s*\d+\.\s+/, "")) + '</li>');
          i++;
        }
        out.push('<ol class="md-list">' + o.join("") + '</ol>');
        continue;
      }
      // Empty line collapses paragraphs
      if (/^\s*$/.test(line)) { i++; continue; }
      // Paragraph (gather until blank line)
      var p = [line];
      i++;
      while (i < lines.length && !/^\s*$/.test(lines[i]) && !/^(?:#{1,6}\s|```|&gt;|\s*[-*+]\s|\s*\d+\.\s)/.test(lines[i])) {
        p.push(lines[i]); i++;
      }
      out.push('<p class="md-p">' + inline(p.join(" ")) + '</p>');
    }
    return out.join("\n");
  }

  if (typeof window !== "undefined") {
    window.DV = window.DV || {};
    window.DV.md = { render: render };
  }
})();
