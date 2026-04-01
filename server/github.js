const https = require("https");

function ghApi(apiPath, token) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: "api.github.com",
      path: apiPath,
      headers: { Authorization: "Bearer " + token, Accept: "application/vnd.github.v3+json", "User-Agent": "DeployView" }
    };
    https.get(opts, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 400) reject(new Error(parsed.message || "GitHub " + res.statusCode));
          else resolve(parsed);
        } catch (e) { reject(e); }
      });
    }).on("error", reject);
  });
}

module.exports = { ghApi };
