(function(){
var S = DV.S, el = DV.el, api = DV.api;

DV.views.setup = function(app) {
  var inp = document.createElement("input"); inp.type = "password"; inp.placeholder = "ghp_xxxx...";
  var err = el("p", { s: { color: "var(--err)", fontSize: "13px", fontFamily: "monospace", display: "none", marginTop: "8px" } }, "Invalid token.");
  var btn = el("button", { c: "bp", on: { click: function() {
    var t = inp.value; if (!t) return; btn.innerHTML = "<span class='spin'></span>";
    api("POST", "/api/token", { token: t }).then(function(r) {
      if (r.ok) { S.hasToken = true; S.view = "dashboard"; DV.loadRepos(); DV.startStatusPoll(); }
      else { err.style.display = "block"; btn.textContent = "Connect"; }
    }).catch(function() { err.style.display = "block"; btn.textContent = "Connect"; });
  } } }, "Connect");
  app.appendChild(el("div", { s: { maxWidth: "460px", margin: "0 auto", padding: "60px 20px", textAlign: "center" } }, [
    el("div", { s: { fontSize: "40px", marginBottom: "16px" } }, "\u26a1"),
    el("h1", { s: { fontSize: "24px", fontWeight: "800", marginBottom: "10px" } }, "Connect to GitHub"),
    el("p", { s: { color: "var(--tx2)", fontSize: "14px", marginBottom: "28px", lineHeight: "1.6" } }, "Personal Access Token with repo scope. Stored on this server only."),
    el("div", { s: { display: "flex", gap: "8px", marginBottom: "4px" } }, [inp, btn]),
    err
  ]));
};
})();
