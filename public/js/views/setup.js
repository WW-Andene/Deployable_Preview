(function(){
var S = DV.S, el = DV.el, api = DV.api;

DV.views.setup = function(app) {
  var inp = el("input", { c: "input-mono", attr: { type: "password", placeholder: "ghp_xxxx..." } });
  var err = el("p", { c: "setup-error hidden" }, "> Invalid token");
  function submit() {
    var t = inp.value; if (!t) return; btn.innerHTML = "<span class='spin'></span>";
    api("POST", "/api/token", { token: t }).then(function(r) {
      if (r.ok) { S.hasToken = true; S.view = "dashboard"; DV.loadRepos(); DV.startStatusPoll(); }
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
    el("p", { c: "setup-subtitle" }, "Personal Access Token with repo scope.\nStored on this server only."),
    el("div", { c: "token-row" }, [inp, btn]),
    err,
    el("p", { c: "label-hint" }, "Required: repo scope")
  ]));
};
})();
