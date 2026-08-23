(function () {
  "use strict";
  window.Studio = window.Studio || {};

  Studio.S = {
    owner: null,
    repo: null,
    slug: null,
    previewUrl: null,
    selected: null,       // { selector, tag, classes, text, attrs, rect, computed } — primary/last selection
    selection: [],        // [{ selector, tag, rect }] — full multi-selection (Shift/Cmd/Ctrl+click)
    changes: [],           // accumulated diff entries
    boxModelOn: false,
    activePanel: "inspect", // 'inspect' | 'code'
    codeFile: null,        // { path, content, sha256 }
    locateCandidates: [],
    rebuilding: false,
    lastRebuildAt: null,
    status: "loading",      // 'loading' | 'ready' | 'error'
    devicePreset: "13t",    // key into DV.VIEW_PRESETS, or "full" for edge-to-edge
    isFullView: false
  };

  var nextChangeId = 1;
  Studio.recordChange = function (entry) {
    entry.at = Date.now();
    entry.id = nextChangeId++;
    Studio.S.changes.push(entry);
    if (Studio.onChangesUpdated) Studio.onChangesUpdated();
  };

  Studio.parseHash = function () {
    var h = decodeURIComponent(window.location.hash.replace(/^#/, ""));
    var parts = h.split("/");
    return { owner: parts[0], repo: parts[1], slug: parts.slice(2).join("/") };
  };
})();
