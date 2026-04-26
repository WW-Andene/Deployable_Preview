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
          const parsed = JSON.parse(data);
          if (res.statusCode >= 400) reject(new Error(parsed.message || "GitHub " + res.statusCode));
          else resolve(parsed);
        } catch (e) { reject(e); }
      });
    });
    req.on("error", reject);
    // Without a timeout the promise never settles when GitHub stalls,
    // leaving HTTP request handlers and build-pipeline awaits hung
    // forever. destroy() triggers the "error" listener above.
    req.setTimeout(GH_TIMEOUT_MS, () => {
      req.destroy(new Error("GitHub API timeout after " + GH_TIMEOUT_MS + "ms: " + apiPath));
    });
  });
}

module.exports = { ghApi };
