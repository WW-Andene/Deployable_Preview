(function () {
  "use strict";
  window.Studio = window.Studio || {};

  function h(tag, attrs, children) {
    var el = document.createElement(tag);
    attrs = attrs || {};
    for (var k in attrs) {
      if (k === "class") el.className = attrs[k];
      else if (k === "text") el.textContent = attrs[k];
      else if (k.indexOf("on") === 0 && typeof attrs[k] === "function") el.addEventListener(k.slice(2), attrs[k]);
      else el.setAttribute(k, attrs[k]);
    }
    (children || []).forEach(function (c) { if (c) el.appendChild(c); });
    return el;
  }

  function numField(label, value, unit, onChange) {
    var wrap = h("div", { class: "st-field" });
    wrap.appendChild(h("label", { text: label }));
    var input = h("input", { type: "number", value: parseFloat(value) || 0 });
    input.addEventListener("change", function () { onChange(input.value + (unit || "px")); });
    wrap.appendChild(input);
    return wrap;
  }

  function colorField(label, value, onChange) {
    var wrap = h("div", { class: "st-field" });
    wrap.appendChild(h("label", { text: label }));
    var row = h("div", { class: "st-color-row" });
    var swatch = h("input", { type: "color" });
    try { swatch.value = rgbToHex(value); } catch (_) { swatch.value = "#000000"; }
    swatch.addEventListener("input", function () { onChange(swatch.value); });
    var text = h("input", { type: "text", value: value || "" });
    text.addEventListener("change", function () { onChange(text.value); });
    row.appendChild(swatch); row.appendChild(text);
    wrap.appendChild(row);
    return wrap;
  }

  function rgbToHex(rgb) {
    var m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(rgb || "");
    if (!m) return rgb && rgb.indexOf("#") === 0 ? rgb : "#000000";
    return "#" + [m[1], m[2], m[3]].map(function (v) { return ("0" + parseInt(v, 10).toString(16)).slice(-2); }).join("");
  }

  function selectField(label, value, options, onChange) {
    var wrap = h("div", { class: "st-field" });
    wrap.appendChild(h("label", { text: label }));
    var sel = document.createElement("select");
    options.forEach(function (o) {
      var opt = document.createElement("option");
      opt.value = o; opt.textContent = o;
      if (o === value) opt.selected = true;
      sel.appendChild(opt);
    });
    sel.addEventListener("change", function () { onChange(sel.value); });
    wrap.appendChild(sel);
    return wrap;
  }

  Studio.renderInspector = function (root) {
    root.innerHTML = "";
    var sel = Studio.S.selected;
    if (!sel) {
      root.appendChild(h("div", { class: "st-empty", text: "Click an element in the preview to select it." }));
      return;
    }
    var c = sel.computed || {};

    root.appendChild(h("div", { class: "st-selected-tag" }, [
      h("span", { class: "st-tag-name", text: sel.tag }),
      h("span", { class: "st-tag-sel", text: sel.selector })
    ]));

    // Box model toggle
    var boxRow = h("div", { class: "st-row" });
    var boxBtn = h("button", { class: "st-btn-sm" + (Studio.S.boxModelOn ? " on" : ""), text: Studio.S.boxModelOn ? "Hide box model" : "Show box model" });
    boxBtn.addEventListener("click", function () {
      Studio.S.boxModelOn = !Studio.S.boxModelOn;
      if (Studio.S.boxModelOn) Studio.guides.showBoxModel(); else Studio.guides.hideBoxModel();
      Studio.renderInspector(root);
    });
    boxRow.appendChild(boxBtn);
    root.appendChild(boxRow);

    // ── Size ──
    root.appendChild(h("div", { class: "st-section-title", text: "Size" }));
    var sizeGrid = h("div", { class: "st-grid-2" });
    sizeGrid.appendChild(numField("Width", c.width, "px", function (v) { Studio.guides.setStyle("width", v); }));
    sizeGrid.appendChild(numField("Height", c.height, "px", function (v) { Studio.guides.setStyle("height", v); }));
    root.appendChild(sizeGrid);

    // ── Padding ──
    root.appendChild(h("div", { class: "st-section-title", text: "Padding (in-object)" }));
    var padGrid = h("div", { class: "st-grid-4" });
    padGrid.appendChild(numField("T", c.paddingTop, "px", function (v) { Studio.guides.setStyle("paddingTop", v); }));
    padGrid.appendChild(numField("R", c.paddingRight, "px", function (v) { Studio.guides.setStyle("paddingRight", v); }));
    padGrid.appendChild(numField("B", c.paddingBottom, "px", function (v) { Studio.guides.setStyle("paddingBottom", v); }));
    padGrid.appendChild(numField("L", c.paddingLeft, "px", function (v) { Studio.guides.setStyle("paddingLeft", v); }));
    root.appendChild(padGrid);

    // ── Margin (spacing between objects) ──
    root.appendChild(h("div", { class: "st-section-title", text: "Margin (between objects)" }));
    var marGrid = h("div", { class: "st-grid-4" });
    marGrid.appendChild(numField("T", c.marginTop, "px", function (v) { Studio.guides.setStyle("marginTop", v); }));
    marGrid.appendChild(numField("R", c.marginRight, "px", function (v) { Studio.guides.setStyle("marginRight", v); }));
    marGrid.appendChild(numField("B", c.marginBottom, "px", function (v) { Studio.guides.setStyle("marginBottom", v); }));
    marGrid.appendChild(numField("L", c.marginLeft, "px", function (v) { Studio.guides.setStyle("marginLeft", v); }));
    root.appendChild(marGrid);

    // ── Alignment (flex/grid parent-aware, but exposed simply) ──
    root.appendChild(h("div", { class: "st-section-title", text: "Alignment" }));
    var alignGrid = h("div", { class: "st-grid-2" });
    alignGrid.appendChild(selectField("Justify", c.justifyContent, ["flex-start", "center", "flex-end", "space-between", "space-around", "space-evenly"], function (v) { Studio.guides.setStyle("justifyContent", v); }));
    alignGrid.appendChild(selectField("Align", c.alignItems, ["flex-start", "center", "flex-end", "stretch", "baseline"], function (v) { Studio.guides.setStyle("alignItems", v); }));
    root.appendChild(alignGrid);
    root.appendChild(numField("Gap (between children)", c.gap, "px", function (v) { Studio.guides.setStyle("gap", v); }));
    root.appendChild(selectField("Text align", c.textAlign, ["left", "center", "right", "justify"], function (v) { Studio.guides.setStyle("textAlign", v); }));

    // ── Typography ──
    root.appendChild(h("div", { class: "st-section-title", text: "Typography" }));
    var typeGrid = h("div", { class: "st-grid-2" });
    typeGrid.appendChild(numField("Font size", c.fontSize, "px", function (v) { Studio.guides.setStyle("fontSize", v); }));
    typeGrid.appendChild(selectField("Weight", c.fontWeight, ["300", "400", "500", "600", "700", "800"], function (v) { Studio.guides.setStyle("fontWeight", v); }));
    root.appendChild(typeGrid);
    root.appendChild(colorField("Text color", c.color, function (v) { Studio.guides.setStyle("color", v); }));

    // ── Fill / border ──
    root.appendChild(h("div", { class: "st-section-title", text: "Fill & border" }));
    root.appendChild(colorField("Background", c.backgroundColor, function (v) { Studio.guides.setStyle("backgroundColor", v); }));
    root.appendChild(numField("Radius", c.borderRadius, "px", function (v) { Studio.guides.setStyle("borderRadius", v); }));
    var borderGrid = h("div", { class: "st-grid-2" });
    borderGrid.appendChild(numField("Border width", c.borderWidth, "px", function (v) { Studio.guides.setStyle("borderWidth", v); Studio.guides.setStyle("borderStyle", "solid"); }));
    borderGrid.appendChild(colorField("Border color", c.borderColor, function (v) { Studio.guides.setStyle("borderColor", v); }));
    root.appendChild(borderGrid);

    // ── Locate in source ──
    root.appendChild(h("div", { class: "st-section-title", text: "Source" }));
    var locateBtn = h("button", { class: "st-btn-sm", text: "Find in source files" });
    locateBtn.addEventListener("click", function () {
      locateBtn.textContent = "Searching…";
      Studio.api.locate({ classes: sel.classes, text: sel.text, attrs: sel.attrs }).then(function (res) {
        Studio.S.locateCandidates = res.candidates || [];
        Studio.renderInspector(root);
      });
    });
    root.appendChild(locateBtn);
    if (Studio.S.locateCandidates.length) {
      var list = h("div", { class: "st-locate-list" });
      Studio.S.locateCandidates.forEach(function (cand) {
        var row = h("div", { class: "st-locate-row" });
        row.appendChild(h("span", { class: "st-locate-path", text: cand.path + ":" + cand.line }));
        row.appendChild(h("span", { class: "st-locate-preview", text: cand.preview }));
        var openBtn = h("button", { class: "st-btn-xs", text: "Open" });
        openBtn.addEventListener("click", function () {
          Studio.openInCodePanel(cand.path, cand.line);
        });
        row.appendChild(openBtn);
        list.appendChild(row);
      });
      root.appendChild(list);
    } else {
      root.appendChild(h("div", { class: "st-hint", text: "No source match yet — click \"Find in source files\" above." }));
    }
  };
})();
