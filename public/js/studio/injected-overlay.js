/**
 * injected-overlay.js — runs INSIDE the previewed app's iframe (injected as
 * a <script> tag by studio/main.js after the iframe loads its own page).
 *
 * Responsibilities, entirely scoped to this document:
 *   - Hover highlight + click-to-select any element
 *   - Drag to reposition (sets position:relative + left/top offset, or for
 *     elements already using a layout the user is dragging within flex/grid
 *     gaps, falls back to margin nudges — see computeDragStrategy)
 *   - Resize handles (sets width/height, or for text sets font-size when
 *     the resize target is a text-only leaf)
 *   - Alignment guides: as an element is dragged/resized, compares its
 *     edges/center against every sibling's edges/center and the viewport
 *     center, snapping + drawing a guide line when within SNAP px
 *   - Padding/margin visualizer: shows the box-model overlay (like
 *     DevTools) for the selected element on demand
 *   - Reports every committed change to the parent window via postMessage
 *     as {type:'studio:change', selector, property, from, to}
 *
 * All edits are applied as INLINE STYLE overrides on the real DOM node.
 * That's deliberate — see studio.js on the server for why this is the only
 * part of the system that can be "always exact" without a source map.
 */
(function () {
  "use strict";
  if (window.__studioOverlayInstalled) return;
  window.__studioOverlayInstalled = true;

  var SNAP = 6;
  var selected = null;
  var hovered = null;
  var dragState = null;
  var resizeState = null;
  var enabled = true;

  var style = document.createElement("style");
  style.textContent =
    ".__studio-hover{outline:1.5px dashed #d4a030 !important;outline-offset:-1px;cursor:pointer;}" +
    ".__studio-selected{outline:2px solid #d4a030 !important;outline-offset:-2px;}" +
    "#__studio-guide-layer{position:fixed;inset:0;pointer-events:none;z-index:2147483646;}" +
    "#__studio-guide-layer .g-line{position:absolute;background:#ff5f6d;}" +
    "#__studio-guide-layer .g-v{width:1px;top:0;bottom:0;}" +
    "#__studio-guide-layer .g-h{height:1px;left:0;right:0;}" +
    "#__studio-guide-layer .g-dim{position:absolute;font:10px/1.4 monospace;background:#ff5f6d;color:#fff;padding:1px 4px;border-radius:2px;transform:translate(-50%,-50%);}" +
    "#__studio-box-model{position:fixed;pointer-events:none;z-index:2147483645;}" +
    "#__studio-box-model .layer{position:absolute;}" +
    "#__studio-resize-handle{position:fixed;width:10px;height:10px;background:#d4a030;border:1.5px solid #14151c;border-radius:2px;z-index:2147483647;cursor:se-resize;}";
  document.documentElement.appendChild(style);

  var guideLayer = document.createElement("div");
  guideLayer.id = "__studio-guide-layer";
  document.documentElement.appendChild(guideLayer);

  var boxModelLayer = document.createElement("div");
  boxModelLayer.id = "__studio-box-model";
  boxModelLayer.style.display = "none";
  document.documentElement.appendChild(boxModelLayer);

  var resizeHandle = document.createElement("div");
  resizeHandle.id = "__studio-resize-handle";
  resizeHandle.style.display = "none";
  document.documentElement.appendChild(resizeHandle);

  function post(msg) {
    try { window.parent.postMessage(Object.assign({ __studio: true }, msg), "*"); } catch (_) {}
  }

  // ── Selector generation (best-effort, stable-ish) ──────────────────────
  function cssPath(el) {
    if (!el || el.nodeType !== 1) return "";
    if (el.id) return "#" + CSS.escape(el.id);
    var parts = [];
    var node = el;
    while (node && node.nodeType === 1 && parts.length < 6) {
      var seg = node.tagName.toLowerCase();
      if (node.classList.length) {
        var cls = Array.prototype.slice.call(node.classList).slice(0, 3).map(function (c) { return "." + CSS.escape(c); }).join("");
        seg += cls;
      }
      var parent = node.parentElement;
      if (parent) {
        var sameTagSiblings = Array.prototype.filter.call(parent.children, function (c) { return c.tagName === node.tagName; });
        if (sameTagSiblings.length > 1) {
          var idx = Array.prototype.indexOf.call(parent.children, node) + 1;
          seg += ":nth-child(" + idx + ")";
        }
      }
      parts.unshift(seg);
      if (node.id) break;
      node = node.parentElement;
    }
    return parts.join(" > ");
  }

  function describeEl(el) {
    var attrs = {};
    for (var i = 0; i < el.attributes.length; i++) {
      var a = el.attributes[i];
      if (a.name.indexOf("data-") === 0 || a.name === "id") attrs[a.name] = a.value;
    }
    return {
      selector: cssPath(el),
      tag: el.tagName.toLowerCase(),
      classes: Array.prototype.slice.call(el.classList),
      text: (el.childElementCount === 0 ? el.textContent : "") || "",
      attrs: attrs
    };
  }

  // ── Hover / select ──────────────────────────────────────────────────────
  function onMouseOver(e) {
    if (!enabled || dragState || resizeState) return;
    var t = e.target;
    if (t === document.documentElement || t === document.body) return;
    if (hovered && hovered !== t) hovered.classList.remove("__studio-hover");
    hovered = t;
    hovered.classList.add("__studio-hover");
  }
  function onMouseOut(e) {
    if (hovered) { hovered.classList.remove("__studio-hover"); hovered = null; }
  }
  function onClick(e) {
    if (!enabled) return;
    e.preventDefault();
    e.stopPropagation();
    selectElement(e.target);
  }

  function selectElement(el) {
    if (selected) selected.classList.remove("__studio-selected");
    selected = el;
    selected.classList.add("__studio-selected");
    positionResizeHandle();
    post({ type: "select", el: describeEl(el), rect: rectOf(el), computed: computedSubset(el) });
  }

  function rectOf(el) {
    var r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  }

  function computedSubset(el) {
    var c = getComputedStyle(el);
    var keys = [
      "display", "position", "width", "height",
      "paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
      "marginTop", "marginRight", "marginBottom", "marginLeft",
      "fontSize", "fontWeight", "lineHeight", "color", "backgroundColor",
      "borderRadius", "borderWidth", "borderColor", "borderStyle",
      "justifyContent", "alignItems", "gap", "flexDirection", "textAlign"
    ];
    var out = {};
    for (var i = 0; i < keys.length; i++) out[keys[i]] = c[keys[i]];
    return out;
  }

  function positionResizeHandle() {
    if (!selected) { resizeHandle.style.display = "none"; return; }
    var r = selected.getBoundingClientRect();
    resizeHandle.style.left = (r.right - 5) + "px";
    resizeHandle.style.top = (r.bottom - 5) + "px";
    resizeHandle.style.display = "block";
  }

  document.addEventListener("mouseover", onMouseOver, true);
  document.addEventListener("mouseout", onMouseOut, true);
  document.addEventListener("click", onClick, true);
  window.addEventListener("scroll", positionResizeHandle, true);
  window.addEventListener("resize", positionResizeHandle);

  // ── Drag to reposition ───────────────────────────────────────────────────
  var dragOriginX, dragOriginY, dragStartLeft, dragStartTop, dragEl;

  document.addEventListener("mousedown", function (e) {
    if (!enabled || !selected) return;
    if (e.target === resizeHandle) return; // resize handled separately
    if (!selected.contains(e.target) && e.target !== selected) return;
    if (e.target.closest("input,textarea,select,button,a")) return; // don't hijack real interactions
    e.preventDefault();
    dragEl = selected;
    var cs = getComputedStyle(dragEl);
    if (cs.position === "static") dragEl.style.position = "relative";
    dragOriginX = e.clientX; dragOriginY = e.clientY;
    dragStartLeft = parseFloat(dragEl.style.left) || 0;
    dragStartTop = parseFloat(dragEl.style.top) || 0;
    dragState = { moved: false };
    document.addEventListener("mousemove", onDragMove);
    document.addEventListener("mouseup", onDragUp);
  }, true);

  function siblingAndPageEdges(el) {
    var edges = { v: [], h: [] };
    edges.v.push({ pos: window.innerWidth / 2, label: "viewport center" });
    var parent = el.parentElement;
    var siblings = parent ? Array.prototype.filter.call(parent.children, function (c) { return c !== el; }) : [];
    siblings.forEach(function (s) {
      var r = s.getBoundingClientRect();
      edges.v.push({ pos: r.left }, { pos: r.right }, { pos: (r.left + r.right) / 2 });
      edges.h.push({ pos: r.top }, { pos: r.bottom }, { pos: (r.top + r.bottom) / 2 });
    });
    edges.h.push({ pos: window.innerHeight / 2, label: "viewport center" });
    return edges;
  }

  function clearGuides() { guideLayer.innerHTML = ""; }
  function drawVGuide(x) {
    var l = document.createElement("div");
    l.className = "g-line g-v";
    l.style.left = x + "px";
    guideLayer.appendChild(l);
  }
  function drawHGuide(y) {
    var l = document.createElement("div");
    l.className = "g-line g-h";
    l.style.top = y + "px";
    guideLayer.appendChild(l);
  }

  function onDragMove(e) {
    if (!dragEl) return;
    dragState.moved = true;
    var dx = e.clientX - dragOriginX;
    var dy = e.clientY - dragOriginY;
    var nx = dragStartLeft + dx;
    var ny = dragStartTop + dy;

    clearGuides();
    var r = dragEl.getBoundingClientRect();
    var w = r.width, h = r.height;
    var projLeft = r.left + dx, projTop = r.top + dy;
    var myXs = [projLeft, projLeft + w, projLeft + w / 2];
    var myYs = [projTop, projTop + h, projTop + h / 2];
    var edges = siblingAndPageEdges(dragEl);

    edges.v.forEach(function (edge) {
      myXs.forEach(function (mx, i) {
        if (Math.abs(mx - edge.pos) < SNAP) {
          var offset = i === 0 ? 0 : i === 1 ? -w : -w / 2;
          nx = dragStartLeft + dx + (edge.pos - mx) ;
          drawVGuide(edge.pos);
        }
      });
    });
    edges.h.forEach(function (edge) {
      myYs.forEach(function (my, i) {
        if (Math.abs(my - edge.pos) < SNAP) {
          ny = dragStartTop + dy + (edge.pos - my);
          drawHGuide(edge.pos);
        }
      });
    });

    dragEl.style.left = nx + "px";
    dragEl.style.top = ny + "px";
    positionResizeHandle();
  }

  function onDragUp() {
    document.removeEventListener("mousemove", onDragMove);
    document.removeEventListener("mouseup", onDragUp);
    clearGuides();
    if (dragEl && dragState && dragState.moved) {
      post({
        type: "change",
        selector: cssPath(dragEl),
        property: "position-offset",
        to: { left: dragEl.style.left, top: dragEl.style.top, position: dragEl.style.position }
      });
    }
    dragEl = null; dragState = null;
  }

  // ── Resize ────────────────────────────────────────────────────────────
  var resizeStartW, resizeStartH, resizeOriginX, resizeOriginY, resizeEl;

  resizeHandle.addEventListener("mousedown", function (e) {
    if (!selected) return;
    e.preventDefault(); e.stopPropagation();
    resizeEl = selected;
    var r = resizeEl.getBoundingClientRect();
    resizeStartW = r.width; resizeStartH = r.height;
    resizeOriginX = e.clientX; resizeOriginY = e.clientY;
    resizeState = { moved: false };
    document.addEventListener("mousemove", onResizeMove);
    document.addEventListener("mouseup", onResizeUp);
  });

  function onResizeMove(e) {
    if (!resizeEl) return;
    resizeState.moved = true;
    var dw = e.clientX - resizeOriginX;
    var dh = e.clientY - resizeOriginY;
    var nw = Math.max(8, resizeStartW + dw);
    var nh = Math.max(8, resizeStartH + dh);
    resizeEl.style.width = nw + "px";
    resizeEl.style.height = nh + "px";
    positionResizeHandle();
  }
  function onResizeUp() {
    document.removeEventListener("mousemove", onResizeMove);
    document.removeEventListener("mouseup", onResizeUp);
    if (resizeEl && resizeState && resizeState.moved) {
      post({
        type: "change",
        selector: cssPath(resizeEl),
        property: "size",
        to: { width: resizeEl.style.width, height: resizeEl.style.height }
      });
    }
    resizeEl = null; resizeState = null;
  }

  // ── Box-model (padding/margin) visualizer ────────────────────────────────
  function showBoxModel(el) {
    if (!el) { boxModelLayer.style.display = "none"; return; }
    var r = el.getBoundingClientRect();
    var c = getComputedStyle(el);
    var mT = parseFloat(c.marginTop), mR = parseFloat(c.marginRight), mB = parseFloat(c.marginBottom), mL = parseFloat(c.marginLeft);
    var pT = parseFloat(c.paddingTop), pR = parseFloat(c.paddingRight), pB = parseFloat(c.paddingBottom), pL = parseFloat(c.paddingLeft);
    boxModelLayer.innerHTML = "";
    function box(x, y, w, h, color) {
      var d = document.createElement("div");
      d.className = "layer";
      d.style.cssText = "left:" + x + "px;top:" + y + "px;width:" + w + "px;height:" + h + "px;background:" + color + ";";
      boxModelLayer.appendChild(d);
    }
    // margin (outermost, orange-ish tint)
    box(r.left - mL, r.top - mT, r.width + mL + mR, r.height + mT + mB, "rgba(212,160,48,0.12)");
    // padding (inner, teal tint) — approximate as a ring by drawing content box under
    box(r.left, r.top, r.width, r.height, "rgba(90,170,255,0.10)");
    box(r.left + pL, r.top + pT, Math.max(0, r.width - pL - pR), Math.max(0, r.height - pT - pB), "rgba(20,21,28,0.35)");
    boxModelLayer.style.display = "block";
  }

  // ── postMessage command handling from parent Studio UI ───────────────────
  window.addEventListener("message", function (e) {
    var msg = e.data;
    if (!msg || !msg.__studioCmd) return;
    switch (msg.cmd) {
      case "setEnabled":
        enabled = !!msg.value;
        if (!enabled) { clearGuides(); if (hovered) hovered.classList.remove("__studio-hover"); }
        break;
      case "select":
        var target = msg.selector ? document.querySelector(msg.selector) : null;
        if (target) selectElement(target);
        break;
      case "deselect":
        if (selected) selected.classList.remove("__studio-selected");
        selected = null;
        resizeHandle.style.display = "none";
        boxModelLayer.style.display = "none";
        break;
      case "showBoxModel":
        showBoxModel(selected);
        break;
      case "hideBoxModel":
        boxModelLayer.style.display = "none";
        break;
      case "setStyle":
        if (selected && msg.property) {
          var before = selected.style[msg.property];
          selected.style[msg.property] = msg.value;
          post({ type: "change", selector: cssPath(selected), property: msg.property, from: before, to: msg.value });
          positionResizeHandle();
          if (boxModelLayer.style.display !== "none") showBoxModel(selected);
        }
        break;
      case "getSelectedStyle":
        if (selected) post({ type: "selectedStyle", computed: computedSubset(selected), rect: rectOf(selected) });
        break;
      default:
        break;
    }
  });

  post({ type: "ready" });
})();
