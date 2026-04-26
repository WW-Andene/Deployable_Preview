// modals/history.js — extracted from monolith via R5.
// Renders into the supplied app element when S.historyModal is set.

(function () {
"use strict";
var S = DV.S, el = DV.el, api = DV.api;
var focusTrap = DV._modal.focusTrap;

DV._modal.history = function render(app) {
  /* ═══════════════ Deployment-history modal ═══════════════ */
  if (S.historyModal) {
    var hm = S.historyModal;
    var hbg = el("div", { c: "modal-bg", on: { click: function(e) { if (e.target === hbg) { S.historyModal = null; DV.render(); } } } });
    var hbox = el("div", { c: "modal modal-history", attr: { role: "dialog", "aria-modal": "true", "aria-labelledby": "modal-history-title" } });
    hbox.appendChild(el("h3", { c: "modal-title", attr: { id: "modal-history-title" } }, "Deployment history — " + hm.owner + "/" + hm.repo + " · " + hm.slug));

    if (hm.loading) {
      hbox.appendChild(DV.skeleton ? DV.skeleton.rows(4) : el("div", { c: "text-center pad-md" }, [el("span", { c: "spin" })]));
    } else if (hm.error) {
      hbox.appendChild(el("div", { c: "color-err font-mono text-12" }, hm.error));
    } else if (!hm.history.length) {
      hbox.appendChild(DV.emptyState({
        icon: "🕘",
        title: "No deployment history yet",
        sub: "DV starts recording snapshots from this branch's first build. Trigger one to see entries here."
      }));
    } else {
      var listBody = el("div", { c: "history-list" });
      for (var hi = 0; hi < hm.history.length; hi++) {
        (function(entry) {
          var rolledBack = entry.by === "rollback";
          var row = el("div", { c: "history-row" + (rolledBack ? " history-row-rollback" : "") });

          var meta = el("div", { c: "history-row-main" });
          var sizePill = null;
          if (entry.bytes) {
            var sizeStr = entry.bytes < 1024 ? entry.bytes + " B"
              : entry.bytes < 1048576 ? (entry.bytes / 1024).toFixed(1) + " KB"
              : (entry.bytes / 1048576).toFixed(2) + " MB";
            sizePill = el("span", { c: "color-tx3 text-11" }, " · " + sizeStr +
              (entry.bytesDeltaPct != null && Math.abs(entry.bytesDeltaPct) >= 0.1
                ? " (" + (entry.bytesDelta > 0 ? "+" : "") + entry.bytesDeltaPct + "%)"
                : ""));
          }
          meta.appendChild(el("div", { c: "history-row-label" }, [
            el("span", { c: "history-row-sha font-mono" }, entry.commitShort || "—"),
            entry.tag ? el("span", { c: "pill pill-ok history-row-tag font-mono", attr: { title: "Tag — also reachable via /__snapshot/" + entry.tag + "/" } }, "🏷 " + entry.tag) : null,
            el("span", { c: "color-tx3 text-11" }, " · " + (entry.timestamp ? new Date(entry.timestamp).toLocaleString() : "?")),
            entry.duration ? el("span", { c: "color-tx3 text-11" }, " · " + entry.duration + "s") : null,
            sizePill,
            rolledBack ? el("span", { c: "pill pill-warn" }, "rollback") : null,
            entry.note ? el("span", { c: "pill pill-info" }, "note") : null
          ].filter(Boolean)));
          if (entry.note) {
            meta.appendChild(el("div", { c: "history-row-note" }, entry.note));
          }
          // H5: comments thread
          if (Array.isArray(entry.comments) && entry.comments.length) {
            var cthread = el("div", { c: "history-row-comments" });
            for (var ci = 0; ci < entry.comments.length; ci++) {
              (function(c) {
                cthread.appendChild(el("div", { c: "history-comment" }, [
                  el("span", { c: "history-comment-by" }, c.by + " · " + new Date(c.at).toLocaleString()),
                  el("div", { c: "history-comment-text" }, c.text),
                  el("button", { c: "bg bs history-comment-del", attr: { title: "Delete comment", "aria-label": "Delete comment" }, on: { click: function() {
                    if (!confirm("Delete this comment?")) return;
                    fetch("/api/history/" + hm.owner + "/" + hm.repo + "/comment/" + encodeURIComponent(c.id) + "?slug=" + encodeURIComponent(hm.slug) + "&historyId=" + encodeURIComponent(entry.id), { method: "DELETE" })
                      .then(function(r){ return r.json(); })
                      .then(function(r){
                        if (r.error) { DV.showToast(r.error, "error"); return; }
                        entry.comments = entry.comments.filter(function(x){ return x.id !== c.id; });
                        DV.render();
                      });
                  } } }, "×")
                ]));
              })(entry.comments[ci]);
            }
            meta.appendChild(cthread);
          }
          // K4: tag button — set/clear a memorable name
          var tagBtn = el("button", { c: "bg bs", attr: { title: entry.tag ? "Re-tag (current: " + entry.tag + ")" : "Tag this build" }, on: { click: function() {
            var newTag = prompt("Tag for " + (entry.commitShort || entry.id) + " (letters/numbers/-_./, blank to clear):", entry.tag || "");
            if (newTag === null) return;
            api("POST", "/api/history/" + hm.owner + "/" + hm.repo + "/tag", {
              slug: hm.slug, historyId: entry.id, tag: newTag
            }).then(function(r) {
              if (r.error) { DV.showToast(r.error, "error"); return; }
              // Update local view (also clear the tag from any other entry)
              if (newTag) for (var k = 0; k < hm.history.length; k++) if (hm.history[k] !== entry) delete hm.history[k].tag;
              entry.tag = newTag ? newTag.trim().slice(0, 64) : undefined;
              DV.render();
            });
          } } }, entry.tag ? "🏷 Re-tag" : "🏷 Tag");
          // Inline buttons: add comment, set/clear note
          var actionRow = el("div", { c: "flex-row gap-6 history-row-actions" }, [
            tagBtn,
            el("button", { c: "bg bs", on: { click: function() {
              var text = prompt("New comment on " + (entry.commitShort || entry.id) + ":");
              if (!text) return;
              api("POST", "/api/history/" + hm.owner + "/" + hm.repo + "/comment", {
                slug: hm.slug, historyId: entry.id, by: "you", text: text
              }).then(function(r) {
                if (r.error) { DV.showToast(r.error, "error"); return; }
                if (!Array.isArray(entry.comments)) entry.comments = [];
                entry.comments.push(r.comment);
                DV.render();
              });
            } } }, "+ Comment"),
            el("button", { c: "bg bs", attr: { title: entry.note ? "Edit note" : "Add note" }, on: { click: function() {
              var fresh = prompt("Note for " + (entry.commitShort || entry.id) + " (≤2000 chars, blank to clear):", entry.note || "");
              if (fresh === null) return;
              api("POST", "/api/history/" + hm.owner + "/" + hm.repo + "/note", {
                slug: hm.slug, historyId: entry.id, note: fresh
              }).then(function(r) {
                if (r.error) { DV.showToast(r.error, "error"); return; }
                entry.note = fresh ? fresh.slice(0, 2000) : undefined;
                DV.render();
              });
            } } }, entry.note ? "✎ Note" : "+ Note")
          ]);
          meta.appendChild(actionRow);
          row.appendChild(meta);

          // Don't offer rollback to the row that's already a rollback
          // action (it's an audit entry, not a snapshot). Snapshots are
          // entries with by="build".
          if (entry.by === "build") {
            row.appendChild(el("button", { c: "bg bs", on: { click: function() {
              if (!confirm("Roll the live preview back to commit " + (entry.commitShort || entry.id) + "?\n\nDoes NOT re-run the build — instantly serves the older bytes.")) return;
              api("POST", "/api/rollback/" + hm.owner + "/" + hm.repo, { slug: hm.slug, historyId: entry.id }).then(function(r) {
                if (r.error) { DV.showToast(r.error, "error"); return; }
                DV.showToast("Rolled back to " + (entry.commitShort || entry.id), "success");
                S.historyModal = null;
                DV.loadRepos();
              });
            } } }, "Rollback"));
          }

          listBody.appendChild(row);
        })(hm.history[hi]);
      }
      hbox.appendChild(listBody);
    }

    hbox.appendChild(el("div", { c: "btn-row" }, [
      el("button", { c: "bg flex-1", on: { click: function() { S.historyModal = null; DV.render(); } } }, "Close")
    ]));

    hbg.appendChild(hbox);
    app.appendChild(hbg);
    focusTrap(hbox, "history");
  }

};
})();
