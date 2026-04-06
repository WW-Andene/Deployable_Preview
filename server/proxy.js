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
        body = body.replace(/<head([^>]*)>/i, '<head$1>' + fetchShim);
        // Remove content-length since we modified the body
        const headers = { ...proxyRes.headers };
        delete headers["content-length"];
        headers["content-security-policy"] = "";
        res.removeHeader("X-Frame-Options");
        res.writeHead(proxyRes.statusCode, headers);
        res.end(body);
      });
    } else {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    }
  });
  proxyReq.on("error", (e) => { res.writeHead(502, { "Content-Type": "text/plain" }); res.end("Server not responding: " + e.message); });
  req.pipe(proxyReq);
}

function serveIndex(outDir, res, previewBase) {
  const indexPath = path.join(outDir, "index.html");
  if (!fs.existsSync(indexPath)) {
    try {
      const files = fs.readdirSync(outDir);
      return res.status(404).send("index.html not found. Files: " + files.join(", "));
    } catch (e) { return res.status(404).send("Output error: " + e.message); }
  }
  let html = fs.readFileSync(indexPath, "utf8");
  html = html.replace(/(src|href|content)="\/(?!\/)/g, '$1="./');

  // Inject fetch/XHR interceptor so client fetch("/api/...") routes through the preview prefix
  if (previewBase) {
    const fetchShim = `<script>(function(){var B=window.fetch,P='${previewBase}';window.fetch=function(u,o){if(typeof u==='string'&&u.startsWith('/')&&!u.startsWith('//'))u=P+u;return B.call(this,u,o);};var X=XMLHttpRequest.prototype.open,O=X;XMLHttpRequest.prototype.open=function(m,u){if(typeof u==='string'&&u.startsWith('/')&&!u.startsWith('//'))u=P+u;return O.call(this,m,u);};})();<\/script>`;
    html = html.replace(/<head([^>]*)>/i, '<head$1>' + fetchShim);
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
  res.setHeader("Content-Security-Policy", "");
  res.setHeader("Content-Type", "text/html");
  res.send(html);
}

module.exports = { proxyTo, serveIndex };
