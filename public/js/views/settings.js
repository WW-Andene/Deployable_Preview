(function(){
var S = DV.S, el = DV.el, api = DV.api;

DV.views.settings = function(app) {
  var ct = el("div", { c: "settings-page" });
  ct.appendChild(el("h2", { c: "page-title mb-8" }, "Settings"));
  ct.appendChild(el("p", { c: "color-tx3 text-12 font-mono mb-20" }, "Register your API keys once \u2014 DeployView uses them everywhere."));

  var keysContainer = el("div", { c: "settings-keys" });
  ct.appendChild(keysContainer);

  // Loading state
  keysContainer.appendChild(el("div", { c: "text-center pad-lg" }, [el("span", { c: "spin" })]));

  fetch("/api/secrets").then(function(r) { return r.json(); }).then(function(secrets) {
    keysContainer.innerHTML = "";

    for (var i = 0; i < secrets.length; i++) {
      (function(secret) {
        var card = el("div", { c: "card settings-key-card" });

        // Header row: label + status
        var header = el("div", { c: "flex-row gap-8 items-center mb-8" });
        header.appendChild(el("span", { c: "settings-key-label" }, secret.label));
        if (secret.hasValue) {
          header.appendChild(el("span", { c: "settings-status-badge settings-status-ok" }, "\u2714 Set"));
          header.appendChild(el("span", { c: "settings-masked font-mono" }, secret.masked));
          if (secret.source === "env") {
            header.appendChild(el("span", { c: "settings-source-badge" }, "from env"));
          }
        } else {
          header.appendChild(el("span", { c: "settings-status-badge settings-status-missing" }, "Not set"));
        }
        card.appendChild(header);

        // Hint
        var hintRow = el("div", { c: "settings-hint" });
        hintRow.appendChild(document.createTextNode(secret.hint));
        if (secret.link) {
          hintRow.appendChild(document.createTextNode(" \u2014 "));
          hintRow.appendChild(el("a", { attr: { href: secret.link, target: "_blank", rel: "noopener" }, c: "settings-link" }, "Get one \u2197"));
        }
        card.appendChild(hintRow);

        // Input row
        var inputRow = el("div", { c: "flex-row gap-6 mt-8" });
        var inp = document.createElement("input");
        inp.className = "flex-1 font-mono";
        inp.type = "password";
        inp.placeholder = secret.hasValue ? "Enter new value to replace..." : "Paste your key here...";
        inp.addEventListener("focus", function() { inp.type = "text"; });
        inp.addEventListener("blur", function() { if (!inp.value) inp.type = "password"; });

        var saveBtn = el("button", { c: "bp bs", on: { click: function() {
          var val = inp.value.trim();
          if (!val) return;
          saveBtn.disabled = true; saveBtn.textContent = "Saving...";
          fetch("/api/secrets", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ key: secret.key, value: val })
          }).then(function(r) { return r.json(); }).then(function(r) {
            if (r.ok) {
              DV.showToast(secret.label + " saved", "success");
              // If we just set the GitHub token, update app state
              if (secret.key === "GITHUB_TOKEN") {
                S.hasToken = true;
              }
              DV.render();
            } else {
              DV.showToast("Error: " + (r.error || "Failed"), "error");
              saveBtn.disabled = false; saveBtn.textContent = "Save";
            }
          }).catch(function() { saveBtn.disabled = false; saveBtn.textContent = "Save"; });
        } } }, "Save");

        inputRow.appendChild(inp);
        inputRow.appendChild(saveBtn);

        if (secret.hasValue && secret.source === "config") {
          inputRow.appendChild(el("button", { c: "bd bs", attr: { title: "Remove this key" }, on: { click: function() {
            if (!confirm("Remove " + secret.label + "?")) return;
            fetch("/api/secrets/" + secret.key, { method: "DELETE" })
              .then(function(r) { return r.json(); })
              .then(function(r) {
                if (r.ok) {
                  DV.showToast(secret.label + " removed", "info");
                  if (secret.key === "GITHUB_TOKEN") S.hasToken = false;
                  DV.render();
                }
              });
          } } }, "x"));
        }

        card.appendChild(inputRow);
        keysContainer.appendChild(card);
      })(secrets[i]);
    }

    // Info box at the bottom
    keysContainer.appendChild(el("div", { c: "settings-info-box mt-20" }, [
      el("div", { c: "settings-info-title" }, "How it works"),
      el("div", {}, "Keys are saved to deployview.json on this server (never sent to third parties)."),
      el("div", {}, "Environment variables still work \u2014 config keys take priority when both are set."),
      el("div", {}, "The GitHub token here replaces the one from the setup page.")
    ]));

  }).catch(function(e) {
    keysContainer.innerHTML = "";
    keysContainer.appendChild(el("div", { c: "color-err" }, "Failed to load keys: " + e.message));
  });

  app.appendChild(ct);
};
})();
