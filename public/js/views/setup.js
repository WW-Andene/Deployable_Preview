(function(){
var S = DV.S, el = DV.el, api = DV.api;

DV.views.setup = function(app) {
  // G1-005: explicit label tied to input via id/for
  var inp = el("input", { c: "input-mono", attr: { id: "setup-token-input", type: "password", placeholder: "ghp_xxxx...", "aria-describedby": "setup-token-hint" } });
  var err = el("p", { c: "setup-error hidden", attr: { role: "alert" } }, "> Invalid token. Check it has 'repo' scope and isn't expired.");
  function submit() {
    var t = inp.value; if (!t) return; btn.innerHTML = "<span class='spin'></span>";
    api("POST", "/api/token", { token: t }).then(function(r) {
      if (r.ok) {
        // Also save to secrets store so it appears in Settings
        fetch("/api/secrets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: "GITHUB_TOKEN", value: t }) }).catch(function(){});
        S.hasToken = true; S.view = "dashboard"; DV.loadRepos();
      }
      else { err.classList.remove("hidden"); btn.textContent = "Connect"; }
    }).catch(function() { err.classList.remove("hidden"); btn.textContent = "Connect"; });
  }
  var btn = el("button", { c: "bp input-min-w", attr: { "aria-label": "Connect to GitHub" }, on: { click: submit } }, "Connect");
  inp.addEventListener("keydown", function(e) { if (e.key === "Enter") submit(); });

  app.appendChild(el("div", { c: "setup-page" }, [
    el("div", { c: "setup-logo" }, "DV"),
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
