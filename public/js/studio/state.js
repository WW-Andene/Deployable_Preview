(function () {
  "use strict";
  window.Studio = window.Studio || {};

  Studio.S = {
    owner: null,
    repo: null,
    slug: null,
    previewUrl: null,
    selected: null,       // { selector, tag, classes, text, attrs, rect, computed }
    changes: [],           // accumulated diff entries
    boxModelOn: false,
    activePanel: "inspect", // 'inspect' | 'code'
    codeFile: null,        // { path, content, sha256 }
    locateCandidates: [],
    rebuilding: false,
    lastRebuildAt: null,
    status: "loading"       // 'loading' | 'ready' | 'error'
  };

  Studio.recordChange = function (entry) {
    entry.at = Date.now();
    Studio.S.changes.push(entry);
    if (Studio.onChangesUpdated) Studio.onChangesUpdated();
  };

  Studio.parseHash = function () {
    var h = decodeURIComponent(window.location.hash.replace(/^#/, ""));
    var parts = h.split("/");
    return { owner: parts[0], repo: parts[1], slug: parts.slice(2).join("/") };
  };
})();
