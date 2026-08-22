(function () {
  "use strict";
  window.Studio = window.Studio || {};

  function base() {
    var S = Studio.S;
    return "/api/studio/" + encodeURIComponent(S.owner) + "/" + encodeURIComponent(S.repo) + "/" + encodeURIComponent(S.slug);
  }

  function req(method, path, body) {
    var opts = { method: method, headers: { "Content-Type": "application/json" } };
    if (body !== undefined) opts.body = JSON.stringify(body);
    return fetch(path, opts).then(function (r) {
      return r.text().then(function (text) {
        var data;
        try { data = text ? JSON.parse(text) : {}; } catch (_) { data = { error: "Bad response (" + r.status + ")" }; }
        if (!r.ok && !data.error) data.error = "HTTP " + r.status;
        return data;
      });
    });
  }

  Studio.api = {
    tree: function () { return req("GET", base() + "/tree"); },
    readFile: function (relPath) { return req("GET", base() + "/file?path=" + encodeURIComponent(relPath)); },
    writeFile: function (relPath, content, baseSha256) {
      return req("PUT", base() + "/file", { path: relPath, content: content, baseSha256: baseSha256 });
    },
    rebuild: function () { return req("POST", base() + "/rebuild", {}); },
    locate: function (el) { return req("POST", base() + "/locate", el); },
    exportChanges: function (changes) { return req("POST", base() + "/export", { changes: changes }); },
    commit: function (message, files) { return req("POST", base() + "/commit", { message: message, files: files }); }
  };
})();
