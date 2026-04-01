const http = require("http");
const fs = require("fs");
const path = require("path");

function proxyTo(port, req, res) {
  const opts = {
    hostname: "127.0.0.1", port, path: req.url, method: req.method,
    headers: { ...req.headers, host: "127.0.0.1:" + port }
  };
  const proxyReq = http.request(opts, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });
  proxyReq.on("error", (e) => { res.status(502).send("Server not responding: " + e.message); });
  req.pipe(proxyReq);
}

function serveIndex(outDir, res) {
  const indexPath = path.join(outDir, "index.html");
  if (!fs.existsSync(indexPath)) {
    try {
      const files = fs.readdirSync(outDir);
      return res.status(404).send("index.html not found. Files: " + files.join(", "));
    } catch (e) { return res.status(404).send("Output error: " + e.message); }
  }
  let html = fs.readFileSync(indexPath, "utf8");
  html = html.replace(/(src|href|content)="\/(?!\/)/g, '$1="./');

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
