const https = require("https");

const GH_TIMEOUT_MS = parseInt(process.env.DV_GH_API_TIMEOUT_MS, 10) || 30000;

function ghApi(apiPath, token) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: "api.github.com",
      path: apiPath,
      headers: { Authorization: "Bearer " + token, Accept: "application/vnd.github.v3+json", "User-Agent": "DeployView" }
    };
    const req = https.get(opts, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try {
          const parsed = data ? JSON.parse(data) : {};
          if (res.statusCode >= 400) {
            const err = new Error(parsed.message || "GitHub " + res.statusCode);
            err.statusCode = res.statusCode;
            err.ghHeaders = res.headers || {};
            err.ghBody = parsed;
            reject(err);
          } else {
            resolve(parsed);
          }
        } catch (e) { reject(e); }
      });
    });
    req.on("error", reject);
    req.setTimeout(GH_TIMEOUT_MS, () => {
      req.destroy(new Error("GitHub API timeout after " + GH_TIMEOUT_MS + "ms: " + apiPath));
    });
  });
}

// ghApiRaw — for cases where the response *headers* matter (scope check).
// Returns { status, headers, body } and never throws on HTTP status.
function ghApiRaw(apiPath, token) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: "api.github.com",
      path: apiPath,
      headers: { Authorization: "Bearer " + token, Accept: "application/vnd.github.v3+json", "User-Agent": "DeployView" }
    };
    const req = https.get(opts, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        let body = null;
        try { body = data ? JSON.parse(data) : null; } catch (_) { body = null; }
        resolve({ status: res.statusCode, headers: res.headers || {}, body });
      });
    });
    req.on("error", reject);
    req.setTimeout(GH_TIMEOUT_MS, () => {
      req.destroy(new Error("GitHub API timeout after " + GH_TIMEOUT_MS + "ms: " + apiPath));
    });
  });
}

module.exports = { ghApi, ghApiRaw };
