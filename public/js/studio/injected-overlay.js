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
      "top", "right", "bottom", "left", "zIndex",
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
  window.addEventListener("scroll", positionResizeHandle, true);
  window.addEventListener("resize", positionResizeHandle);

  // ── Drag to reposition ───────────────────────────────────────────────────
  // Canva-style: on first drag, an element is lifted out of normal flow and
  // pinned with absolute left/top against its nearest positioned ancestor.
  // "Layout-aware" means: we detect if the parent is flex/grid and (a) make
  // sure the parent becomes the positioning context (position:relative) so
  // siblings still laid out by flex/grid are undisturbed, and (b) flag the
  // change so the UI can tell the user "this left the flex/grid flow".
  var dragOriginX, dragOriginY, dragStartLeft, dragStartTop, dragEl;
  var dragWasInFlow = false, dragParentLayout = "block";
  var dragSpacingCandidates = null; // cached once per drag, see spacingCandidates()

  function nearestPositionedAncestor(el) {
    var node = el.parentElement;
    while (node && node !== document.body.parentElement) {
      var p = getComputedStyle(node).position;
      if (p === "relative" || p === "absolute" || p === "fixed" || p === "sticky") return node;
      node = node.parentElement;
    }
    return null;
  }

  function liftToFreeform(el) {
    var cs = getComputedStyle(el);
    var wasStatic = cs.position === "static";
    dragWasInFlow = wasStatic;

    var parent = el.parentElement;
    var parentCs = parent ? getComputedStyle(parent) : null;
    dragParentLayout = parentCs ? parentCs.display : "block";

    // Snapshot current visual box BEFORE we touch position, so the
    // conversion to absolute doesn't visually jump the element.
    var r = el.getBoundingClientRect();

    if (wasStatic) {
      // Make sure there's a positioned ancestor to anchor against so the
      // element doesn't jump to document-root coordinates. Prefer the
      // direct parent — this keeps it visually "inside" its original
      // container, which matches how Canva-style tools group objects.
      if (parent && parentCs.position === "static") {
        parent.style.position = "relative";
      }
      var anchor = nearestPositionedAncestor(el) || parent;
      var aRect = anchor ? anchor.getBoundingClientRect() : { left: 0, top: 0 };
      el.style.position = "absolute";
      el.style.left = (r.left - aRect.left) + "px";
      el.style.top = (r.top - aRect.top) + "px";
      // Freeze the box size at drag start so removing it from flex/grid
      // flow (which can change sizing rules) doesn't resize it.
      if (!el.style.width) el.style.width = r.width + "px";
      if (!el.style.height) el.style.height = r.height + "px";
    }
  }

  // Select AND drag in a single gesture: on mousedown we immediately select
  // whatever was clicked (so this doubles as the old "click to select"), and
  // arm a pending drag. The pending drag only actually engages (lifting the
  // element to freeform positioning) once the pointer has moved past a small
  // threshold — that's what lets a plain click still just select without
  // nudging the element, while a click-and-drag in one motion works too
  // (previously drag only armed if an element was *already* selected from a
  // prior, separate click, which made a single click-drag gesture do nothing).
  var DRAG_THRESHOLD = 4;
  var pendingDragEl = null, pendingDragStarted = false;

  document.addEventListener("mousedown", function (e) {
    if (!enabled) return;
    if (e.target === resizeHandle) return; // resize handled separately
    var t = e.target;
    if (t === document.documentElement || t === document.body) return;

    e.preventDefault();
    e.stopPropagation();

    var actingEl = (selected && (t === selected || selected.contains(t))) ? selected : t;
    if (selected !== actingEl) selectElement(actingEl);

    if (t.closest && t.closest("input,textarea,select,button,a")) return; // don't hijack real interactions

    pendingDragEl = actingEl;
    pendingDragStarted = false;
    dragOriginX = e.clientX; dragOriginY = e.clientY;
    document.addEventListener("mousemove", onPendingDragMove);
    document.addEventListener("mouseup", onPendingDragUp);
  }, true);

  function onPendingDragMove(e) {
    if (!pendingDragEl) return;
    if (!pendingDragStarted) {
      var dx0 = e.clientX - dragOriginX, dy0 = e.clientY - dragOriginY;
      if (Math.abs(dx0) < DRAG_THRESHOLD && Math.abs(dy0) < DRAG_THRESHOLD) return;
      pendingDragStarted = true;
      dragEl = pendingDragEl;
      liftToFreeform(dragEl);
      dragStartLeft = parseFloat(dragEl.style.left) || 0;
      dragStartTop = parseFloat(dragEl.style.top) || 0;
      dragState = { moved: false };
      dragSpacingCandidates = spacingCandidates(dragEl); // snapshot rects once; sibling boxes don't move mid-drag
    }
    onDragMove(e);
  }

  function onPendingDragUp() {
    document.removeEventListener("mousemove", onPendingDragMove);
    document.removeEventListener("mouseup", onPendingDragUp);
    if (pendingDragStarted) onDragUp();
    pendingDragEl = null; pendingDragStarted = false;
  }

  function siblingAndPageEdges(el) {
    var edges = { v: [], h: [] };
    edges.v.push({ pos: window.innerWidth / 2, label: "center" });
    var parent = el.parentElement;
    var siblings = parent ? Array.prototype.filter.call(parent.children, function (c) { return c !== el; }) : [];
    siblings.forEach(function (s) {
      var r = s.getBoundingClientRect();
      edges.v.push({ pos: r.left, y: r.top, y2: r.bottom }, { pos: r.right, y: r.top, y2: r.bottom }, { pos: (r.left + r.right) / 2, y: r.top, y2: r.bottom });
      edges.h.push({ pos: r.top }, { pos: r.bottom }, { pos: (r.top + r.bottom) / 2 });
    });
    edges.h.push({ pos: window.innerHeight / 2, label: "center" });
    return edges;
  }

  function clearGuides() { guideLayer.innerHTML = ""; }
  function drawVGuide(x, y1, y2) {
    var l = document.createElement("div");
    l.className = "g-line g-v";
    l.style.left = x + "px";
    if (y1 != null) { l.style.top = y1 + "px"; l.style.bottom = ""; l.style.height = (y2 - y1) + "px"; }
    guideLayer.appendChild(l);
  }
  function drawHGuide(y, x1, x2) {
    var l = document.createElement("div");
    l.className = "g-line g-h";
    l.style.top = y + "px";
    if (x1 != null) { l.style.left = x1 + "px"; l.style.right = ""; l.style.width = (x2 - x1) + "px"; }
    guideLayer.appendChild(l);
  }
  function drawDim(x, y, text) {
    var d = document.createElement("div");
    d.className = "g-dim";
    d.style.left = x + "px";
    d.style.top = y + "px";
    d.textContent = text;
    guideLayer.appendChild(d);
  }
  // Small tick marks at each end of a spacing guide, Canva/Figma-style.
  function drawSpacingSegment(axis, a, b, cross) {
    // axis: "v" spacing is horizontal (gap along x), "h" spacing is vertical (gap along y)
    if (axis === "x") {
      drawHGuide(cross, a, b);
      drawDim((a + b) / 2, cross - 8, Math.round(b - a) + "px");
    } else {
      drawVGuide(cross, a, b);
      drawDim(cross + 14, (a + b) / 2, Math.round(b - a) + "px");
    }
  }

  // Broad candidate pool for equal-spacing comparisons: not just direct
  // siblings, but any visible, reasonably-sized element on the page. This
  // lets a gap inside the header match a gap somewhere else on the page,
  // the way Canva compares spacing across the whole canvas, not just
  // within one group.
  function spacingCandidates(el) {
    var all = document.body.querySelectorAll("*");
    var out = [];
    for (var i = 0; i < all.length; i++) {
      var node = all[i];
      if (node === el || node.contains(el) || el.contains(node)) continue;
      if (node.id && node.id.indexOf("__studio") === 0) continue;
      var tag = node.tagName;
      if (tag === "SCRIPT" || tag === "STYLE" || tag === "LINK" || tag === "META") continue;
      var r = node.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) continue; // skip invisible/zero-size boxes
      if (r.bottom < 0 || r.top > window.innerHeight || r.right < 0 || r.left > window.innerWidth) continue; // offscreen
      out.push(r);
    }
    return out;
  }

  // Gaps between the dragged element and every candidate box (page-wide,
  // not just siblings), plus gaps among candidate pairs that are spatially
  // adjacent to the dragged element's row/column. Used for equal-spacing
  // guides: if the dragged element's gap to some box equals another pair's
  // gap anywhere on the page, show a matching guide, Canva/Figma-style.
  function siblingGapsExcluding(el, projRect) {
    var candidates = dragSpacingCandidates || spacingCandidates(el);
    var rects = candidates.concat([projRect]);
    var byLeft = rects.slice().sort(function (a, b) { return a.left - b.left; });
    var byTop = rects.slice().sort(function (a, b) { return a.top - b.top; });

    function verticallyOverlaps(a, b) { return a.top < b.bottom && b.top < a.bottom; }
    function horizontallyOverlaps(a, b) { return a.left < b.right && b.left < a.right; }

    var xGaps = [];
    for (var i = 0; i < byLeft.length; i++) {
      for (var k = i + 1; k < byLeft.length; k++) {
        var a = byLeft[i], b = byLeft[k];
        if (!verticallyOverlaps(a, b)) continue; // only compare boxes that sit in roughly the same row
        var gap = b.left - a.right;
        if (gap > 0) {
          xGaps.push({ gap: gap, a: a, b: b, involvesDragged: a === projRect || b === projRect });
          break; // nearest box to the right only, per left-anchor, avoids O(n^2) noise
        }
      }
    }
    var yGaps = [];
    for (var j = 0; j < byTop.length; j++) {
      for (var m = j + 1; m < byTop.length; m++) {
        var c = byTop[j], d = byTop[m];
        if (!horizontallyOverlaps(c, d)) continue; // only compare boxes in roughly the same column
        var gapY = d.top - c.bottom;
        if (gapY > 0) {
          yGaps.push({ gap: gapY, a: c, b: d, involvesDragged: c === projRect || d === projRect });
          break;
        }
      }
    }
    return { xGaps: xGaps, yGaps: yGaps };
  }

  function drawEqualSpacingGuides(el, projRect) {
    var gaps = siblingGapsExcluding(el, projRect);
    var TOL = 2;

    var draggedX = gaps.xGaps.filter(function (g) { return g.involvesDragged; });
    var othersX = gaps.xGaps.filter(function (g) { return !g.involvesDragged; });
    draggedX.forEach(function (dg) {
      othersX.forEach(function (og) {
        if (Math.abs(dg.gap - og.gap) < TOL) {
          var crossY = (Math.max(dg.a.top, dg.b.top) + Math.min(dg.a.bottom, dg.b.bottom)) / 2;
          var crossY2 = (Math.max(og.a.top, og.b.top) + Math.min(og.a.bottom, og.b.bottom)) / 2;
          drawSpacingSegment("x", dg.a.right, dg.b.left, crossY);
          drawSpacingSegment("x", og.a.right, og.b.left, crossY2);
        }
      });
    });

    var draggedY = gaps.yGaps.filter(function (g) { return g.involvesDragged; });
    var othersY = gaps.yGaps.filter(function (g) { return !g.involvesDragged; });
    draggedY.forEach(function (dg) {
      othersY.forEach(function (og) {
        if (Math.abs(dg.gap - og.gap) < TOL) {
          var crossX = (Math.max(dg.a.left, dg.b.left) + Math.min(dg.a.right, dg.b.right)) / 2;
          var crossX2 = (Math.max(og.a.left, og.b.left) + Math.min(og.a.right, og.b.right)) / 2;
          drawSpacingSegment("y", dg.a.bottom, dg.b.top, crossX);
          drawSpacingSegment("y", og.a.bottom, og.b.top, crossX2);
        }
      });
    });
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

    // For each candidate edge (left/right/center-x of self vs siblings+page),
    // snap the whole box by the same delta so width isn't distorted.
    var snappedX = false, snappedY = false;
    edges.v.forEach(function (edge) {
      if (snappedX) return;
      myXs.forEach(function (mx) {
        if (snappedX) return;
        if (Math.abs(mx - edge.pos) < SNAP) {
          nx = nx + (edge.pos - mx);
          var spanTop = edge.y != null ? Math.min(edge.y, projTop) : projTop;
          var spanBottom = edge.y2 != null ? Math.max(edge.y2, projTop + h) : projTop + h;
          drawVGuide(edge.pos, spanTop, spanBottom);
          if (edge.label) drawDim(edge.pos + 6, projTop - 14, edge.label);
          snappedX = true;
        }
      });
    });
    edges.h.forEach(function (edge) {
      if (snappedY) return;
      myYs.forEach(function (my) {
        if (snappedY) return;
        if (Math.abs(my - edge.pos) < SNAP) {
          ny = ny + (edge.pos - my);
          drawHGuide(edge.pos, projLeft - 20, projLeft + w + 20);
          if (edge.label) drawDim(projLeft + w + 26, edge.pos, edge.label);
          snappedY = true;
        }
      });
    });

    // Equal-spacing guides compare against the *snapped* projected box.
    var finalRect = { left: nx, right: nx + w, top: ny, bottom: ny + h };
    drawEqualSpacingGuides(dragEl, finalRect);

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
        to: { left: dragEl.style.left, top: dragEl.style.top, position: dragEl.style.position },
        leftFlow: dragWasInFlow,
        parentLayout: dragParentLayout
      });
    }
    dragEl = null; dragState = null; dragSpacingCandidates = null;
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
