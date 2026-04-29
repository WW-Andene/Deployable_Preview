(function(){
var S = DV.S, el = DV.el, api = DV.api;

DV.views.setup = function(app) {
  // G1-005: explicit label tied to input via id/for
  var inp = el("input", { c: "input-mono", attr: { id: "setup-token-input", type: "password", placeholder: "ghp_xxxx...", "aria-describedby": "setup-token-hint" } });
  var err = el("p", { c: "setup-error hidden", attr: { role: "alert" } }, "");
  function showErr(msg) { err.textContent = "> " + msg; err.classList.remove("hidden"); btn.textContent = "Connect"; }
  function submit() {
    var t = (inp.value || "").trim(); if (!t) return;
    err.classList.add("hidden");
    btn.innerHTML = "<span class='spin'></span>";
    api("POST", "/api/token", { token: t }).then(function(r) {
      if (r && r.ok) {
        fetch("/api/secrets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: "GITHUB_TOKEN", value: t }) }).catch(function(){});
        S.hasToken = true;
        S.view = "dashboard";
        // Switch the view immediately. loadRepos used to be the
        // only thing that triggered render() — if its first /api/repos
        // call ever failed (timing race, transient 401, network blip),
        // the user got stranded on the setup page with the spinner
        // showing forever and no error to act on.
        btn.textContent = "Connect";
        DV.render();
        DV.loadRepos();
        return;
      }
      // Map server error codes to actionable hints.
      var code = r && r.code;
      if (code === "missing_scope") {
        showErr("Token is missing the `repo` scope. Open the Create token link below and re-issue with `repo` (and `workflow` if you'll trigger Actions).");
      } else if (code === "invalid") {
        showErr("Invalid or expired token. Re-issue at github.com/settings/tokens.");
      } else if (code === "forbidden") {
        showErr((r && r.error) || "Token rejected by GitHub.");
      } else if (code === "empty") {
        showErr("Paste a token first.");
      } else if (code === "network") {
        showErr("Network error reaching api.github.com. Check connectivity and retry.");
      } else {
        showErr((r && r.error) || "Invalid token. Check it has 'repo' scope and isn't expired.");
      }
    }).catch(function(e) { showErr("Network error: " + ((e && e.message) || "unknown")); });
  }
  var btn = el("button", { c: "bp input-min-w", attr: { "aria-label": "Connect to GitHub" }, on: { click: submit } }, "Connect");
  inp.addEventListener("keydown", function(e) { if (e.key === "Enter") submit(); });

  app.appendChild(el("div", { c: "setup-page" }, [
    el("div", { c: "brand-monogram" }, "DV"),
    el("h1", { c: "setup-title" }, [
      el("span", { c: "color-accent" }, "Deploy"),
      el("span", { c: "color-tx2" }, "View")
    ]),
    el("label", { c: "setup-subtitle", attr: { "for": "setup-token-input" } }, "Personal Access Token with repo scope.\nStored on this server only."),
    el("div", { c: "token-row" }, [inp, btn]),
    err,
    el("p", { c: "label-hint", attr: { id: "setup-token-hint" } }, [
      "Required: ",
      el("span", { c: "color-accent" }, "repo"),
      " scope. ",
      el("a", { attr: { href: "https://github.com/settings/tokens/new?scopes=repo,workflow&description=DeployView", target: "_blank", rel: "noopener" }, c: "color-accent" }, "Create token \u2197"),
      " \u00b7 ",
      el("a", { attr: { href: "https://github.com/settings/tokens", target: "_blank", rel: "noopener" }, c: "color-accent" }, "Manage existing")
    ])
  ]));
};
})();
