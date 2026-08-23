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
  var selectedSet = []; // multi-select, Shift/Cmd/Ctrl+click — see toggleSelect()
  var hovered = null;
  var dragState = null;
  var resizeState = null;
  var enabled = true;
  // Touch (mobile) has no Shift key for additive selection — a persistent
  // toggle sent from the parent UI stands in for it there. See main.js's
  // "Multi-select" topbar button.
  var multiSelectMode = false;

  var style = document.createElement("style");
  style.textContent =
    ".__studio-hover{outline:1.5px dashed #d4a030 !important;outline-offset:-1px;cursor:pointer;}" +
    ".__studio-selected{outline:2px solid #d4a030 !important;outline-offset:-2px;}" +
    ".__studio-multi-selected{outline:2px solid #5aaaff !important;outline-offset:-2px;}" +
    "#__studio-guide-layer{position:fixed;inset:0;pointer-events:none;z-index:2147483646;}" +
    "#__studio-guide-layer .g-line{position:absolute;background:#ff5f6d;}" +
    "#__studio-guide-layer .g-v{width:1px;top:0;bottom:0;}" +
    "#__studio-guide-layer .g-h{height:1px;left:0;right:0;}" +
    "#__studio-guide-layer .g-dim{position:absolute;font:10px/1.4 monospace;background:#ff5f6d;color:#fff;padding:1px 4px;border-radius:2px;transform:translate(-50%,-50%);}" +
    "#__studio-box-model{position:fixed;pointer-events:none;z-index:2147483645;}" +
    "#__studio-box-model .layer{position:absolute;}" +
    "#__studio-resize-handle{position:fixed;width:10px;height:10px;background:#d4a030;border:1.5px solid #14151c;border-radius:2px;z-index:2147483647;cursor:se-resize;touch-action:none;}" +
    "@media (pointer:coarse){#__studio-resize-handle{width:26px;height:26px;border-radius:6px;}}" +
    "#__studio-rotate-handle{position:fixed;width:12px;height:12px;background:#5aaaff;border:1.5px solid #14151c;border-radius:50%;z-index:2147483647;cursor:grab;touch-action:none;}" +
    "@media (pointer:coarse){#__studio-rotate-handle{width:26px;height:26px;}}" +
    "#__studio-grid-layer{position:absolute;inset:0;pointer-events:none;z-index:2147483644;display:none;}" +
    "html.__studio-dragging, html.__studio-dragging *{touch-action:none !important;}";
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

  var rotateHandle = document.createElement("div");
  rotateHandle.id = "__studio-rotate-handle";
  rotateHandle.style.display = "none";
  document.documentElement.appendChild(rotateHandle);

  var gridLayer = document.createElement("div");
  gridLayer.id = "__studio-grid-layer";
  document.documentElement.appendChild(gridLayer);
  var snapToGrid = false, gridSize = 8;

  function post(msg) {
    try { window.parent.postMessage(Object.assign({ __studio: true }, msg), "*"); } catch (_) {}
  }

  var nextGroupId = 1;
  function newGroupId() { return "g" + (nextGroupId++); }

  // ── Selector generation (best-effort, stable-ish) ──────────────────────
  // Studio's own bookkeeping classes must never leak into a computed
  // selector or the "classes" sent for source-file matching — they're not
  // part of the page's real markup, and matching on them would either
  // produce a selector that can never match anything in source, or (worse)
  // silently target whatever else happens to be hovered/selected at the
  // moment the selector is read back later.
  var STUDIO_OWN_CLASSES = ["__studio-hover", "__studio-selected", "__studio-multi-selected"];
  function realClassList(el) {
    return Array.prototype.slice.call(el.classList).filter(function (c) { return STUDIO_OWN_CLASSES.indexOf(c) === -1; });
  }

  function cssPath(el) {
    if (!el || el.nodeType !== 1) return "";
    if (el.id) return "#" + CSS.escape(el.id);
    var parts = [];
    var node = el;
    while (node && node.nodeType === 1 && parts.length < 6) {
      var seg = node.tagName.toLowerCase();
      var realClasses = realClassList(node);
      if (realClasses.length) {
        var cls = realClasses.slice(0, 3).map(function (c) { return "." + CSS.escape(c); }).join("");
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
      classes: realClassList(el),
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

  function clearSelectionClasses() {
    if (selected) selected.classList.remove("__studio-selected");
    selectedSet.forEach(function (e) { e.classList.remove("__studio-selected", "__studio-multi-selected"); });
  }

  function applySelectionClasses() {
    selectedSet.forEach(function (e) {
      e.classList.remove("__studio-selected", "__studio-multi-selected");
      e.classList.add(selectedSet.length > 1 ? "__studio-multi-selected" : "__studio-selected");
    });
    if (selected && selectedSet.length > 1) selected.classList.add("__studio-selected");
  }

  function postSelection() {
    positionResizeHandle();
    post({
      type: "select",
      el: selected ? describeEl(selected) : null,
      rect: selected ? rectOf(selected) : null,
      computed: selected ? computedSubset(selected) : null,
      multi: selectedSet.map(function (e) { return { selector: cssPath(e), tag: e.tagName.toLowerCase(), rect: rectOf(e) }; })
    });
  }

  // Plain click: replace the whole selection with just this element.
  function selectElement(el) {
    clearSelectionClasses();
    selected = el;
    selectedSet = [el];
    applySelectionClasses();
    postSelection();
  }

  // Shift/Cmd/Ctrl+click: toggle this element in/out of the multi-selection
  // without disturbing the rest — Canva/Figma-style additive selection.
  function toggleSelect(el) {
    clearSelectionClasses();
    var idx = selectedSet.indexOf(el);
    if (idx === -1) { selectedSet.push(el); selected = el; }
    else {
      selectedSet.splice(idx, 1);
      selected = selectedSet.length ? selectedSet[selectedSet.length - 1] : null;
    }
    applySelectionClasses();
    postSelection();
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
    out.rotationDeg = currentRotationDeg(el); // synthetic — see currentRotationDeg
    return out;
  }

  function positionResizeHandle() {
    if (!selected) { resizeHandle.style.display = "none"; rotateHandle.style.display = "none"; return; }
    var r = selected.getBoundingClientRect();
    resizeHandle.style.display = "block"; // must be visible before offsetWidth is meaningful
    var hw = resizeHandle.offsetWidth / 2, hh = resizeHandle.offsetHeight / 2;
    resizeHandle.style.left = (r.right - hw) + "px";
    resizeHandle.style.top = (r.bottom - hh) + "px";

    // Rotate handle floats above the (axis-aligned) bounding box's top
    // center. For a rotated element this tracks the box, not the visually
    // rotated corner — an approximation, same spirit as the resize handle
    // not accounting for rotation either.
    rotateHandle.style.display = "block";
    var rhw = rotateHandle.offsetWidth / 2, rhh = rotateHandle.offsetHeight / 2;
    rotateHandle.style.left = ((r.left + r.right) / 2 - rhw) + "px";
    rotateHandle.style.top = (r.top - 24 - rhh) + "px";
  }

  // We always set rotation as the ONLY transform (never combined with
  // scale/skew), so it can be read back with a plain regex instead of
  // decomposing a matrix() — same "inline style is the source of truth"
  // approach as every other property here.
  function currentRotationDeg(el) {
    var m = /rotate\((-?[\d.]+)deg\)/.exec(el.style.transform || "");
    return m ? parseFloat(m[1]) : 0;
  }
  function angleOf(cx, cy, x, y) {
    return Math.atan2(y - cy, x - cx) * 180 / Math.PI;
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

  // Moves an already-freeform (or about-to-be-lifted) element so its box
  // sits at the given viewport-space (targetLeft, targetTop), converting
  // into its own anchor's local coordinate space. Used by align/distribute,
  // which — unlike drag — computes target positions from *other* elements'
  // rects, not from a pointer delta.
  function moveElementToRect(el, targetLeft, targetTop) {
    liftToFreeform(el);
    var anchor = nearestPositionedAncestor(el) || el.parentElement;
    var aRect = anchor ? anchor.getBoundingClientRect() : { left: 0, top: 0 };
    el.style.left = (targetLeft - aRect.left) + "px";
    el.style.top = (targetTop - aRect.top) + "px";
  }

  // ── Duplicate (Canva/Figma Ctrl/Cmd+D) ───────────────────────────────────
  // Clones the element next to itself. A freeform (absolute) element's
  // clone is nudged +16/+16 so it's visibly distinct from the original
  // instead of sitting exactly on top of it; an in-flow element's clone is
  // simply inserted right after it, so it appears "below" in normal layout
  // — no coordinate math needed, and it stays subject to the same flex/
  // grid rules as its sibling.
  function duplicateOne(el) {
    var clone = el.cloneNode(true);
    // IDs must be unique — cloneNode copies them verbatim, which would
    // leave two elements answering to the same "#id" selector and make
    // every selector-based command (align, apply-to-code, undo…) target
    // whichever one document.querySelector happens to hit first. Strip
    // them from the clone and all its descendants; cssPath() then falls
    // back to its class/nth-child path, which does disambiguate correctly.
    if (clone.id) clone.removeAttribute("id");
    var idEls = clone.querySelectorAll ? clone.querySelectorAll("[id]") : [];
    for (var i = 0; i < idEls.length; i++) idEls[i].removeAttribute("id");
    var cs = getComputedStyle(el);
    if (cs.position === "absolute" || cs.position === "fixed") {
      // Read the COMPUTED left/top, not just el.style — an element can be
      // absolute/fixed purely via an author stylesheet (never dragged in
      // Studio, so no inline left/top exists yet), and computed left/top
      // resolves to a real px value in that case too, unlike el.style
      // which would silently be "" (parseFloat → NaN → wrongly treated as 0).
      var left = parseFloat(cs.left) || 0;
      var top = parseFloat(cs.top) || 0;
      clone.style.left = (left + 16) + "px";
      clone.style.top = (top + 16) + "px";
    }
    el.insertAdjacentElement("afterend", clone);
    return clone;
  }

  function duplicateSelection() {
    var targets = selectedSet.length ? selectedSet.slice() : (selected ? [selected] : []);
    if (!targets.length) return;
    clearSelectionClasses();
    // Duplicating N elements is ONE user action — tag every resulting
    // change with the same groupId so a single Ctrl/Cmd+Z undoes all of
    // them together instead of just the last one (see undo.js popGroup()).
    var groupId = targets.length > 1 ? newGroupId() : null;
    var newSet = [];
    targets.forEach(function (el) {
      var originalSelector = cssPath(el);
      var clone = duplicateOne(el);
      newSet.push(clone);
      post({
        type: "change",
        selector: cssPath(clone),
        el: describeEl(clone),
        property: "duplicate",
        from: { selector: originalSelector },
        to: { selector: cssPath(clone) },
        groupId: groupId
      });
    });
    selectedSet = newSet;
    selected = newSet[newSet.length - 1];
    applySelectionClasses();
    postSelection();
  }

  // Used by undo (removes a clone) — selector must still resolve to exactly
  // the cloned node, which holds as long as nothing else changed the DOM
  // shape in between (same caveat as every other selector-based command).
  function removeBySelector(selector) {
    var el = selector ? document.querySelector(selector) : null;
    if (!el) return;
    if (selectedSet.indexOf(el) !== -1) { clearSelectionClasses(); selectedSet = selectedSet.filter(function (e) { return e !== el; }); selected = selectedSet.length ? selectedSet[selectedSet.length - 1] : null; applySelectionClasses(); }
    el.remove();
    postSelection();
  }

  // ── Align & distribute (Canva/Figma toolbar actions on a multi-selection) ─
  // Mirrors liftToFreeform's static->absolute conversion math to compute
  // what an element's left/top *would have been* pre-move, so the resulting
  // change carries a usable "from" for undo (see moveElementToRect).
  function captureFromPos(el, r) {
    var wasStatic = getComputedStyle(el).position === "static";
    if (!wasStatic) return { left: el.style.left, top: el.style.top, position: el.style.position };
    var anchor = nearestPositionedAncestor(el) || el.parentElement;
    var aRect = anchor ? anchor.getBoundingClientRect() : { left: 0, top: 0 };
    return { left: (r.left - aRect.left) + "px", top: (r.top - aRect.top) + "px", position: "" };
  }

  function alignSelection(mode) {
    if (selectedSet.length < 2) return;
    var items = selectedSet.map(function (el) { return { el: el, r: el.getBoundingClientRect(), from: null }; });
    items.forEach(function (i) { i.from = captureFromPos(i.el, i.r); });
    // One align/distribute click moves several elements as ONE user action —
    // group them so a single undo reverts all of them (see undo.js popGroup()).
    var groupId = newGroupId();

    function commit(i) {
      post({
        type: "change",
        selector: cssPath(i.el),
        el: describeEl(i.el),
        property: "position-offset",
        from: i.from,
        to: { left: i.el.style.left, top: i.el.style.top, position: i.el.style.position },
        groupId: groupId
      });
    }

    if (mode === "left" || mode === "centerH" || mode === "right") {
      var minLeft = Math.min.apply(null, items.map(function (i) { return i.r.left; }));
      var maxRight = Math.max.apply(null, items.map(function (i) { return i.r.right; }));
      items.forEach(function (i) {
        var x = mode === "left" ? minLeft : mode === "right" ? maxRight - i.r.width : (minLeft + maxRight) / 2 - i.r.width / 2;
        moveElementToRect(i.el, x, i.r.top);
        commit(i);
      });
    } else if (mode === "top" || mode === "centerV" || mode === "bottom") {
      var minTop = Math.min.apply(null, items.map(function (i) { return i.r.top; }));
      var maxBottom = Math.max.apply(null, items.map(function (i) { return i.r.bottom; }));
      items.forEach(function (i) {
        var y = mode === "top" ? minTop : mode === "bottom" ? maxBottom - i.r.height : (minTop + maxBottom) / 2 - i.r.height / 2;
        moveElementToRect(i.el, i.r.left, y);
        commit(i);
      });
    } else if (mode === "distributeH") {
      if (items.length < 3) return;
      var sortedH = items.slice().sort(function (a, b) { return a.r.left - b.r.left; });
      var span = sortedH[sortedH.length - 1].r.right - sortedH[0].r.left;
      var totalW = sortedH.reduce(function (s, i) { return s + i.r.width; }, 0);
      var gapH = (span - totalW) / (sortedH.length - 1);
      var cursor = sortedH[0].r.left;
      sortedH.forEach(function (i) {
        moveElementToRect(i.el, cursor, i.r.top);
        commit(i);
        cursor += i.r.width + gapH;
      });
    } else if (mode === "distributeV") {
      if (items.length < 3) return;
      var sortedV = items.slice().sort(function (a, b) { return a.r.top - b.r.top; });
      var spanV = sortedV[sortedV.length - 1].r.bottom - sortedV[0].r.top;
      var totalH = sortedV.reduce(function (s, i) { return s + i.r.height; }, 0);
      var gapV = (spanV - totalH) / (sortedV.length - 1);
      var cursorV = sortedV[0].r.top;
      sortedV.forEach(function (i) {
        moveElementToRect(i.el, i.r.left, cursorV);
        commit(i);
        cursorV += i.r.height + gapV;
      });
    }
    postSelection(); // refresh rects for the multi-select toolbar after the move
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

  // Pointer Events (not mouse-only) so the same code drives mouse, touch,
  // and pen — required for Studio to work on a phone/tablet, not just a
  // trackpad. clientX/clientY/target all behave the same as MouseEvent.
  document.addEventListener("pointerdown", function (e) {
    if (!enabled) return;
    if (e.target === resizeHandle || e.target === rotateHandle) return; // handled by their own listeners
    var t = e.target;
    if (t === document.documentElement || t === document.body) return;

    // On touch, DON'T cancel the default action here — that would kill the
    // page's native scroll on every single tap, including ones that were
    // never going to become a drag. Selecting-by-tapping doesn't need
    // preventDefault at all; a drag that actually engages calls it itself,
    // later, from onPendingDragMove (a non-passive pointermove listener can
    // still cancel an in-progress touch scroll). Mouse/pen keep the
    // original behavior (avoids ghost text-selection while dragging).
    if (e.pointerType !== "touch") e.preventDefault();
    e.stopPropagation();

    // Shift/Cmd/Ctrl+click toggles multi-selection (desktop); the
    // Multi-select topbar toggle does the same thing for touch, which has
    // no modifier keys. Either way this never starts a drag — additive
    // selection is a distinct gesture from moving an object.
    if (multiSelectMode || e.shiftKey || e.metaKey || e.ctrlKey) {
      toggleSelect(t);
      return;
    }

    var actingEl = (selected && (t === selected || selected.contains(t))) ? selected : t;
    if (selected !== actingEl || selectedSet.length > 1) selectElement(actingEl);

    if (t.closest && t.closest("input,textarea,select,button,a")) return; // don't hijack real interactions

    pendingDragEl = actingEl;
    pendingDragStarted = false;
    dragOriginX = e.clientX; dragOriginY = e.clientY;
    document.addEventListener("pointermove", onPendingDragMove);
    document.addEventListener("pointerup", onPendingDragUp);
    // pointercancel fires instead of pointerup when the OS interrupts a
    // touch gesture mid-way (incoming call, edge-navigation swipe…) — treat
    // it the same as pointerup so listeners get cleaned up and
    // __studio-dragging (touch-action:none on the whole document) doesn't
    // get stuck on, permanently disabling touch scroll until reload.
    document.addEventListener("pointercancel", onPendingDragUp);
  }, true);

  function onPendingDragMove(e) {
    if (!pendingDragEl) return;
    if (!pendingDragStarted) {
      var dx0 = e.clientX - dragOriginX, dy0 = e.clientY - dragOriginY;
      if (Math.abs(dx0) < DRAG_THRESHOLD && Math.abs(dy0) < DRAG_THRESHOLD) return;
      pendingDragStarted = true;
      dragEl = pendingDragEl;
      e.preventDefault(); // now that we know it's a drag, cancel touch's native scroll for the rest of the gesture
      document.documentElement.classList.add("__studio-dragging");
      liftToFreeform(dragEl);
      dragStartLeft = parseFloat(dragEl.style.left) || 0;
      dragStartTop = parseFloat(dragEl.style.top) || 0;
      dragState = { moved: false };
      dragSpacingCandidates = spacingCandidates(dragEl); // snapshot rects once; sibling boxes don't move mid-drag
    }
    onDragMove(e);
  }

  function onPendingDragUp() {
    document.removeEventListener("pointermove", onPendingDragMove);
    document.removeEventListener("pointerup", onPendingDragUp);
    document.removeEventListener("pointercancel", onPendingDragUp);
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

    // Grid snap is a fallback for whichever axis a smart guide didn't
    // already claim — guides (aligning to real content) take priority.
    if (snapToGrid) {
      if (!snappedX) nx = snapVal(nx);
      if (!snappedY) ny = snapVal(ny);
    }

    dragEl.style.left = nx + "px";
    dragEl.style.top = ny + "px";
    positionResizeHandle();
  }

  function onDragUp() {
    document.removeEventListener("pointermove", onDragMove);
    document.removeEventListener("pointerup", onDragUp);
    document.documentElement.classList.remove("__studio-dragging");
    clearGuides();
    if (dragEl && dragState && dragState.moved) {
      post({
        type: "change",
        selector: cssPath(dragEl),
        el: describeEl(dragEl),
        property: "position-offset",
        // "from" reproduces the pre-drag visual position (useful for undo);
        // note it stays position:absolute even for a freshly-lifted element,
        // so undoing doesn't restore original flow-layout — see liftToFreeform.
        from: { left: dragStartLeft + "px", top: dragStartTop + "px", position: dragEl.style.position },
        to: { left: dragEl.style.left, top: dragEl.style.top, position: dragEl.style.position },
        leftFlow: dragWasInFlow,
        parentLayout: dragParentLayout
      });
    }
    dragEl = null; dragState = null; dragSpacingCandidates = null;
  }

  // ── Resize ────────────────────────────────────────────────────────────
  var resizeStartW, resizeStartH, resizeOriginX, resizeOriginY, resizeEl;

  resizeHandle.addEventListener("pointerdown", function (e) {
    if (!selected) return;
    e.preventDefault(); e.stopPropagation();
    resizeEl = selected;
    var r = resizeEl.getBoundingClientRect();
    resizeStartW = r.width; resizeStartH = r.height;
    resizeOriginX = e.clientX; resizeOriginY = e.clientY;
    resizeState = { moved: false };
    document.documentElement.classList.add("__studio-dragging");
    document.addEventListener("pointermove", onResizeMove);
    document.addEventListener("pointerup", onResizeUp);
    document.addEventListener("pointercancel", onResizeUp); // see pendingDrag's pointercancel comment
  });

  function onResizeMove(e) {
    if (!resizeEl) return;
    resizeState.moved = true;
    var dw = e.clientX - resizeOriginX;
    var dh = e.clientY - resizeOriginY;
    var nw = Math.max(8, resizeStartW + dw);
    var nh = Math.max(8, resizeStartH + dh);
    if (snapToGrid) { nw = Math.max(gridSize, snapVal(nw)); nh = Math.max(gridSize, snapVal(nh)); }
    resizeEl.style.width = nw + "px";
    resizeEl.style.height = nh + "px";
    positionResizeHandle();
  }
  function onResizeUp() {
    document.removeEventListener("pointermove", onResizeMove);
    document.removeEventListener("pointerup", onResizeUp);
    document.removeEventListener("pointercancel", onResizeUp);
    document.documentElement.classList.remove("__studio-dragging");
    if (resizeEl && resizeState && resizeState.moved) {
      post({
        type: "change",
        selector: cssPath(resizeEl),
        el: describeEl(resizeEl),
        property: "size",
        from: { width: resizeStartW + "px", height: resizeStartH + "px" },
        to: { width: resizeEl.style.width, height: resizeEl.style.height }
      });
    }
    resizeEl = null; resizeState = null;
  }

  // ── Rotate ────────────────────────────────────────────────────────────
  var rotateEl, rotateState, rotateCx, rotateCy, rotateStartDeg, rotatePointerStartDeg;

  rotateHandle.addEventListener("pointerdown", function (e) {
    if (!selected) return;
    e.preventDefault(); e.stopPropagation();
    rotateEl = selected;
    var r = rotateEl.getBoundingClientRect();
    rotateCx = (r.left + r.right) / 2;
    rotateCy = (r.top + r.bottom) / 2;
    rotateStartDeg = currentRotationDeg(rotateEl);
    rotatePointerStartDeg = angleOf(rotateCx, rotateCy, e.clientX, e.clientY);
    rotateState = { moved: false };
    document.documentElement.classList.add("__studio-dragging");
    document.addEventListener("pointermove", onRotateMove);
    document.addEventListener("pointerup", onRotateUp);
    document.addEventListener("pointercancel", onRotateUp); // see pendingDrag's pointercancel comment
  });

  function onRotateMove(e) {
    if (!rotateEl) return;
    rotateState.moved = true;
    var pointerDeg = angleOf(rotateCx, rotateCy, e.clientX, e.clientY);
    var deg = rotateStartDeg + (pointerDeg - rotatePointerStartDeg);
    // Shift snaps to 15° increments, Figma/Canva-style.
    if (e.shiftKey) deg = Math.round(deg / 15) * 15;
    rotateEl.style.transform = "rotate(" + Math.round(deg) + "deg)";
    positionResizeHandle();
  }
  function onRotateUp() {
    document.removeEventListener("pointermove", onRotateMove);
    document.removeEventListener("pointerup", onRotateUp);
    document.removeEventListener("pointercancel", onRotateUp);
    document.documentElement.classList.remove("__studio-dragging");
    if (rotateEl && rotateState && rotateState.moved) {
      post({
        type: "change",
        selector: cssPath(rotateEl),
        el: describeEl(rotateEl),
        property: "transform",
        from: rotateStartDeg ? "rotate(" + rotateStartDeg + "deg)" : "",
        to: rotateEl.style.transform
      });
    }
    rotateEl = null; rotateState = null;
  }

  // ── Snap to grid ──────────────────────────────────────────────────────
  function snapVal(v) { return Math.round(v / gridSize) * gridSize; }

  function drawGrid() {
    if (!snapToGrid) { gridLayer.style.display = "none"; return; }
    var w = Math.max(document.documentElement.scrollWidth, window.innerWidth);
    var h = Math.max(document.documentElement.scrollHeight, window.innerHeight);
    gridLayer.style.width = w + "px";
    gridLayer.style.height = h + "px";
    gridLayer.style.backgroundImage =
      "linear-gradient(to right, rgba(90,170,255,.18) 1px, transparent 1px)," +
      "linear-gradient(to bottom, rgba(90,170,255,.18) 1px, transparent 1px)";
    gridLayer.style.backgroundSize = gridSize + "px " + gridSize + "px";
    gridLayer.style.display = "block";
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
      case "setMultiSelectMode":
        multiSelectMode = !!msg.value;
        break;
      case "setSnapToGrid":
        snapToGrid = !!msg.value;
        if (msg.size) gridSize = Math.max(2, msg.size);
        drawGrid();
        break;
      case "select":
        var target = msg.selector ? document.querySelector(msg.selector) : null;
        if (target) selectElement(target);
        break;
      case "deselect":
        clearSelectionClasses();
        selected = null;
        selectedSet = [];
        resizeHandle.style.display = "none";
        boxModelLayer.style.display = "none";
        break;
      case "align":
        alignSelection(msg.mode);
        break;
      case "duplicate":
        duplicateSelection();
        break;
      case "removeElement":
        removeBySelector(msg.selector);
        break;
      case "redoDuplicate":
        // Used by redo — recreates a clone from the ORIGINAL element
        // without recording a new change (undo.js re-pushes the existing
        // one). The recreated clone's selector may differ slightly from
        // the one that was undone if the DOM shape shifted in between —
        // same best-effort caveat as every other selector-based command.
        var origEl = msg.selector ? document.querySelector(msg.selector) : null;
        if (origEl) selectElement(duplicateOne(origEl));
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
          post({ type: "change", selector: cssPath(selected), el: describeEl(selected), property: msg.property, from: before, to: msg.value });
          positionResizeHandle();
          if (boxModelLayer.style.display !== "none") showBoxModel(selected);
        }
        break;
      case "getSelectedStyle":
        if (selected) post({ type: "selectedStyle", computed: computedSubset(selected), rect: rectOf(selected) });
        break;
      case "applyValue":
        // Used by undo/redo — sets a change's from/to value directly,
        // without recording a new "change" (that would defeat the point).
        var applyTarget = msg.selector ? document.querySelector(msg.selector) : null;
        if (applyTarget) {
          if (msg.property === "position-offset") {
            applyTarget.style.position = (msg.value && msg.value.position) || "";
            applyTarget.style.left = (msg.value && msg.value.left) || "";
            applyTarget.style.top = (msg.value && msg.value.top) || "";
          } else if (msg.property === "size") {
            applyTarget.style.width = (msg.value && msg.value.width) || "";
            applyTarget.style.height = (msg.value && msg.value.height) || "";
          } else {
            applyTarget.style[msg.property] = msg.value;
          }
          if (selected === applyTarget) {
            positionResizeHandle();
            if (boxModelLayer.style.display !== "none") showBoxModel(applyTarget);
          }
        }
        break;
      default:
        break;
    }
  });

  // Keyboard shortcuts while focus is inside the previewed page (e.g. right
  // after a drag) — forward to the parent Studio UI, which owns the actual
  // undo/redo stack (see state.js / undo.js).
  document.addEventListener("keydown", function (e) {
    if (!enabled) return;
    var mod = e.metaKey || e.ctrlKey;
    if (!mod) return;
    if (e.target && e.target.closest && e.target.closest("input,textarea,[contenteditable]")) return;
    var key = e.key.toLowerCase();
    if (key === "z") { e.preventDefault(); post({ type: e.shiftKey ? "redo" : "undo" }); }
    else if (key === "d") { e.preventDefault(); duplicateSelection(); }
  });

  post({ type: "ready" });
})();
