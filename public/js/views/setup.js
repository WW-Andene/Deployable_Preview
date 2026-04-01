(function(){
var S = DV.S, el = DV.el, api = DV.api;

DV.views.setup = function(app) {
  var inp = document.createElement("input"); inp.type = "password"; inp.placeholder = "ghp_xxxx...";
  inp.style.fontFamily = "var(--font-mono)";
  var err = el("p", { s: { color: "var(--err)", fontSize: "13px", fontFamily: "var(--font-mono)", display: "none", marginTop: "8px" } }, "Invalid token.");
  var btn = el("button", { c: "bp", s: { minWidth: "100px" }, on: { click: function() {
    var t = inp.value; if (!t) return; btn.innerHTML = "<span class='spin'></span>";
    api("POST", "/api/token", { token: t }).then(function(r) {
      if (r.ok) { S.hasToken = true; S.view = "dashboard"; DV.loadRepos(); DV.startStatusPoll(); }
      else { err.style.display = "block"; btn.textContent = "Connect"; }
    }).catch(function() { err.style.display = "block"; btn.textContent = "Connect"; });
  } } }, "Connect");

  app.appendChild(el("div", { s: { maxWidth: "440px", margin: "0 auto", padding: "100px 20px", textAlign: "center" } }, [
    el("div", { s: { fontSize: "52px", marginBottom: "20px", filter: "drop-shadow(0 0 30px var(--accent-glow))" } }, "\u26a1"),
    el("h1", { s: { fontSize: "28px", fontWeight: "700", marginBottom: "6px", letterSpacing: "-0.04em" } }, [
      el("span", { s: { color: "var(--accent)" } }, "Deploy"),
      el("span", { s: { color: "var(--tx2)" } }, "View")
    ]),
    el("p", { s: { color: "var(--tx3)", fontFamily: "var(--font-mono)", fontSize: "12px", marginBottom: "36px", lineHeight: "1.7", letterSpacing: "0.01em" } }, "Personal Access Token with repo scope.\nStored on this server only."),
    el("div", { s: { display: "flex", gap: "8px", marginBottom: "4px" } }, [inp, btn]),
    err
  ]));
};
})();
