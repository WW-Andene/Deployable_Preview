const http = require("http");
const fs = require("fs");
const path = require("path");

function proxyTo(port, req, res, stripPrefix) {
  // Strip the /preview/owner/repo/slug prefix so the target app receives clean paths
  var targetPath = req.originalUrl || req.url;
  if (stripPrefix && targetPath.startsWith(stripPrefix)) {
    targetPath = targetPath.slice(stripPrefix.length) || "/";
  }
  const opts = {
    hostname: "127.0.0.1", port, path: targetPath, method: req.method,
    headers: { ...req.headers, host: "127.0.0.1:" + port }
  };
  const isHtml = !path.extname(targetPath) || targetPath.endsWith(".html") || targetPath === "/";
  const proxyReq = http.request(opts, (proxyRes) => {
    const contentType = proxyRes.headers["content-type"] || "";
    // For HTML responses from server-mode apps, inject a fetch interceptor
    // so the client's fetch("/api/...") gets rewritten to the preview prefix
    if (stripPrefix && contentType.includes("text/html")) {
      let body = "";
      proxyRes.setEncoding("utf8");
      proxyRes.on("data", (chunk) => { body += chunk; });
      proxyRes.on("end", () => {
        const fetchShim = `<script>(function(){var B=window.fetch,P='${stripPrefix}';window.fetch=function(u,o){if(typeof u==='string'&&u.startsWith('/')&&!u.startsWith('//'))u=P+u;return B.call(this,u,o);};var X=XMLHttpRequest.prototype.open,O=X;XMLHttpRequest.prototype.open=function(m,u){if(typeof u==='string'&&u.startsWith('/')&&!u.startsWith('//'))u=P+u;return O.call(this,m,u);};})();<\/script>`;
        // J3: inject the runtime-error collector. Posts back to
        // /api/preview-errors/<owner>/<repo>/<slug> with keepalive so
        // even errors during page-unload reach us.
        const errCollectorPath = stripPrefix.replace("/preview/", "/api/preview-errors/");
        const errShim = require("./preview-errors").collectorScript(errCollectorPath);
        body = body.replace(/<head([^>]*)>/i, '<head$1>' + fetchShim + errShim);
        // Remove content-length since we modified the body
        const headers = { ...proxyRes.headers };
        delete headers["content-length"];
        // F-K001: only strip directives that block iframe embedding
        // (frame-ancestors / X-Frame-Options). Preserve script-src and
        // friends so the user's own CSP still protects the preview.
        if (headers["content-security-policy"]) {
          headers["content-security-policy"] = String(headers["content-security-policy"])
            .split(/;\s*/).filter((d) => !/^frame-ancestors/i.test(d)).join("; ");
        }
        res.removeHeader("X-Frame-Options");
        res.writeHead(proxyRes.statusCode, headers);
        res.end(body);
      });
    } else {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    }
  });
  proxyReq.on("error", (e) => {
    res.writeHead(502, { "Content-Type": "text/html" });
    res.end('<!DOCTYPE html><html><head><meta charset="utf-8"><title>502 - Server Not Responding</title><style>body{background:#090a10;color:#e6e1d5;font-family:system-ui;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}div{text-align:center;max-width:400px}h1{color:#d4a030;font-size:20px}p{color:#9e9890;font-size:14px;margin:12px 0}button{background:#d4a030;color:#090a10;border:none;padding:10px 24px;border-radius:5px;cursor:pointer;font-size:14px;font-weight:600}button:hover{background:#eab840}</style></head><body><div><h1>502 - Server Not Responding</h1><p>' + e.message + '</p><button onclick="location.reload()">Retry</button><p style="font-size:12px;color:#6a665e;margin-top:24px">The preview server may still be starting up.</p></div></body></html>');
  });
  req.pipe(proxyReq);
}

// F-K002: hide sensitive paths from the file browser. .env / lock-files /
// node_modules / SSH keys / cert material are not "preview content" and
// must never appear in the listing — they may contain secrets that the
// /api auth gate is supposed to protect.
var FILE_BROWSER_HIDE_RE = /^(\.git|\.env|\.env\..*|\.npmrc|\.aws|\.ssh|\.gnupg|\.netrc|node_modules|deployview\.json|deployview\.json\.bak|.*\.pem|.*\.key|.*\.crt|id_rsa.*|id_ed25519.*)$/i;

function serveFileBrowser(outDir, res, previewBase) {
  var files = [];
  try { files = fs.readdirSync(outDir); } catch (e) { files = []; }
  // Separate dirs and files, get sizes
  var items = files.filter(function(f) { return !FILE_BROWSER_HIDE_RE.test(f); }).map(function(f) {
    try {
      var st = fs.statSync(path.join(outDir, f));
      return { name: f, isDir: st.isDirectory(), size: st.size, mtime: st.mtimeMs };
    } catch (e) { return { name: f, isDir: false, size: 0, mtime: 0 }; }
  });
  items.sort(function(a, b) { if (a.isDir !== b.isDir) return a.isDir ? -1 : 1; return a.name.localeCompare(b.name); });

  function fmtSize(n) { if (n < 1024) return n + " B"; if (n < 1048576) return (n / 1024).toFixed(1) + " KB"; return (n / 1048576).toFixed(1) + " MB"; }

  var rows = items.map(function(it) {
    var icon = it.isDir ? "\uD83D\uDCC1" : "\uD83D\uDCC4";
    var href = (previewBase || "") + "/" + it.name + (it.isDir ? "/" : "");
    return '<tr><td>' + icon + '</td><td><a href="' + href + '" style="color:#d4a030;text-decoration:none">' + it.name + '</a></td><td style="color:#6a665e;text-align:right">' + (it.isDir ? "-" : fmtSize(it.size)) + '</td></tr>';
  }).join("");

  res.removeHeader("X-Frame-Options");
  res.setHeader("Content-Type", "text/html");
  res.send('<!DOCTYPE html><html><head><meta charset="utf-8"><title>Project Files</title>'
    + '<style>body{background:#090a10;color:#e6e1d5;font-family:system-ui;margin:0;padding:24px}h1{color:#d4a030;font-size:18px;margin-bottom:4px}.sub{color:#9e9890;font-size:13px;margin-bottom:16px}table{width:100%;border-collapse:collapse;font-size:13px}tr{border-bottom:1px solid #1a1e28}td{padding:6px 8px;vertical-align:middle}td:first-child{width:24px}a:hover{text-decoration:underline}.badge{display:inline-block;padding:3px 10px;border-radius:12px;font-size:11px;font-family:monospace;background:rgba(74,222,128,.1);color:#4ade80;border:1px solid rgba(74,222,128,.2);margin-left:8px}</style>'
    + '</head><body><h1>Build Complete <span class="badge">ready</span></h1>'
    + '<p class="sub">No index.html found — showing project files. ' + items.length + ' items</p>'
    + '<table>' + rows + '</table></body></html>');
}

function serveIndex(outDir, res, previewBase) {
  const indexPath = path.join(outDir, "index.html");
  if (!fs.existsSync(indexPath)) {
    return serveFileBrowser(outDir, res, previewBase);
  }
  let html = fs.readFileSync(indexPath, "utf8");
  html = html.replace(/(src|href|content)="\/(?!\/)/g, '$1="./');

  // Inject fetch/XHR interceptor so client fetch("/api/...") routes through the preview prefix
  if (previewBase) {
    const fetchShim = `<script>(function(){var B=window.fetch,P='${previewBase}';window.fetch=function(u,o){if(typeof u==='string'&&u.startsWith('/')&&!u.startsWith('//'))u=P+u;return B.call(this,u,o);};var X=XMLHttpRequest.prototype.open,O=X;XMLHttpRequest.prototype.open=function(m,u){if(typeof u==='string'&&u.startsWith('/')&&!u.startsWith('//'))u=P+u;return O.call(this,m,u);};})();<\/script>`;
    // J3: also inject the runtime-error collector for static-mode previews.
    const errCollectorPath = previewBase.replace("/preview/", "/api/preview-errors/");
    const errShim = require("./preview-errors").collectorScript(errCollectorPath);
    html = html.replace(/<head([^>]*)>/i, '<head$1>' + fetchShim + errShim);
  }

  const pwaShim = `<script>(function(){
if(navigator.serviceWorker){var r=navigator.serviceWorker.register.bind(navigator.serviceWorker);
navigator.serviceWorker.register=function(u,o){
if(typeof u==='string'&&u.startsWith('/')&&!u.startsWith('//'))u='.'+u;
if(o&&o.scope&&o.scope.startsWith('/')&&!o.scope.startsWith('//'))o=Object.assign({},o,{scope:'.'+o.scope});
return r(u,o);};}
var B=window.Blob;window.Blob=function(p,o){
if(o&&o.type==='application/json'&&p&&p[0]){try{var m=JSON.parse(p[0]);
if(m.start_url&&m.display){if(m.start_url==='/')m.start_url='./';
if(!m.scope||m.scope==='/')m.scope='./';
return new B([JSON.stringify(m)],o);}}catch(e){}}
return new B(p,o);};window.Blob.prototype=B.prototype;
})();</script>`;

  html = html.replace(/<head([^>]*)>/i, '<head$1>' + pwaShim);
  res.removeHeader("X-Frame-Options");
  // F-K001: scrub only frame-ancestors. The static HTML may have its own
  // <meta http-equiv="Content-Security-Policy"> tag that we don't touch.
  // Setting an empty CSP header here drops anything the upstream layer
  // might have set, which is fine because static files don't have one.
  res.setHeader("Content-Type", "text/html");
  res.send(html);
}

module.exports = { proxyTo, serveIndex };
