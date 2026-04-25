// DeployView — inline SVG icon set
//
// 14×14 stroke icons, 1.5px line weight, currentColor. Designed to slot
// into existing button text positions where Unicode glyphs (▶ ↗ ↻ ✕ ≡
// ✎ 🔗 🔌 📋) lived previously. Inline so the dashboard stays single-
// HTTP-request, no sprite sheet, no font.
//
// Usage:
//   el("button", { c: "bg bs", html: DV.icon("preview") }, "")
// or directly:
//   document.createElement("span"); span.innerHTML = DV.icon("rebuild");
//
// All icons share the same 14×14 viewBox so they line up. Override size
// via the optional 2nd arg.
(function () {
  "use strict";

  var ICONS = {
    // Playback / nav
    preview:    '<polygon points="4,3 12,7 4,11" fill="currentColor"/>',
    stop:       '<rect x="3.5" y="3.5" width="7" height="7" fill="currentColor"/>',
    arrow_out:  '<path d="M5 9 L9 5 M5 5 L9 5 L9 9" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    rebuild:    '<path d="M11 4.5 A4 4 0 1 0 11 9.5 M11 2 V5 H8" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    close:      '<path d="M3.5 3.5 L10.5 10.5 M10.5 3.5 L3.5 10.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',

    // Content
    log:        '<path d="M2.5 4 H11.5 M2.5 7 H11.5 M2.5 10 H8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
    edit:       '<path d="M2.5 11 L4 11 L11 4 L9.5 2.5 L2.5 9.5 Z" stroke="currentColor" stroke-width="1.3" fill="none" stroke-linejoin="round"/>',
    link:       '<path d="M5.5 8.5 L8.5 5.5 M4.5 9.5 A2 2 0 0 1 4.5 6.5 L6 5 M9.5 4.5 A2 2 0 0 1 9.5 7.5 L8 9" stroke="currentColor" stroke-width="1.3" fill="none" stroke-linecap="round"/>',
    clipboard:  '<path d="M4 3 H10 V11 H4 Z M5.5 3 V2 H8.5 V3" stroke="currentColor" stroke-width="1.3" fill="none" stroke-linejoin="round"/>',

    // Brand-y
    plug:       '<path d="M5 2 V4 M9 2 V4 M3 4 H11 V7 A4 4 0 0 1 7 11 A4 4 0 0 1 3 7 Z M7 11 V13" stroke="currentColor" stroke-width="1.3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',

    // Three-bar mini chart for the Analytics tab
    chart:      '<rect x="2.5" y="8.5" width="2.5" height="3" fill="currentColor"/><rect x="6"   y="5.5" width="2.5" height="6" fill="currentColor"/><rect x="9.5" y="3"   width="2.5" height="8.5" fill="currentColor"/>'
  };

  /**
   * Return an SVG string for a named icon. Sized to 14×14 by default.
   * @param {string} name  — one of the ICONS keys
   * @param {number} [size=14]
   * @returns {string} SVG markup
   */
  function icon(name, size) {
    var body = ICONS[name];
    if (!body) return "";
    var s = size || 14;
    return '<svg width="' + s + '" height="' + s + '" viewBox="0 0 14 14" aria-hidden="true" focusable="false" style="display:inline-block;vertical-align:-2px">' + body + "</svg>";
  }

  /**
   * Same as icon() but returns a real DOM <span> ready to be passed to
   * el(...) as a child. Use this when wiring icons into existing
   * el("button", {...}, DV.iconEl("preview")) call sites.
   */
  function iconEl(name, size) {
    var span = document.createElement("span");
    span.className = "dv-icon";
    span.innerHTML = icon(name, size);
    return span;
  }

  if (typeof window !== "undefined") {
    window.DV = window.DV || {};
    window.DV.icon = icon;
    window.DV.iconEl = iconEl;
  }
})();
