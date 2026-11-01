// Local mock of a Met watch page (video.js-like API, cue points, subtitles, 2 audio tracks) served as
// https://ondemand.metopera.org via --host-resolver-rules (self-signed cert). Test-only.
const https = require('https'), fs = require('fs'), path = require('path');
const D = __dirname;
const CUES = [['Opening Credits', 0, ''], ['Prelude', 46, 'I'], ['Westwärts schweift der Blick', 640, 'I'], ['Weh! Ach wehe!', 1100, 'I'],
  ['O sink hernieder', 1500, 'II'], ['Einsam wachend in der Nacht', 1800, 'II'], ['Mild und leise', 2150, 'III']]
  .map((c, i, a) => ({ id: 'c' + i, name: 'track' + (i + 1), type: 'CODE', time: c[1], startTime: c[1], endTime: (a[i + 1] || [0, 2400])[1], title: c[0], act: c[2] }));
function serve(req, res) {
  const u = new URL(req.url, 'https://x');
  if (u.pathname.startsWith('/performance/detail/')) {
    const clip = u.pathname.indexOf('43') > 0 ? 'clip43.webm' : u.pathname.indexOf('broken') > 0 ? 'missing.webm' : 'clip169.webm';
    const nov = u.pathname.indexOf('novideo') > 0;
    let html = fs.readFileSync(path.join(D, 'mock.html'), 'utf8').replace('__CLIP__', clip).replace('__CUES__', JSON.stringify(CUES));
    if (nov) html = html.replace(/<div class="Player">[\s\S]*?<\/video-js>\s*<\/div>/, '<div class="Player"></div>');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(html);
  }
  const f = path.join(D, path.basename(u.pathname));
  if (!fs.existsSync(f) || !/\.(webm|vtt)$/.test(f)) { res.writeHead(404); return res.end('nf'); }
  const size = fs.statSync(f).size, type = f.endsWith('.vtt') ? 'text/vtt' : 'video/webm';
  const range = /bytes=(\d+)-(\d*)/.exec(req.headers.range || '');
  const h = { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Access-Control-Allow-Origin': '*' };
  if (range) {
    const s = +range[1], e = range[2] ? +range[2] : size - 1;
    res.writeHead(206, Object.assign(h, { 'Content-Range': `bytes ${s}-${e}/${size}`, 'Content-Length': e - s + 1 }));
    fs.createReadStream(f, { start: s, end: e }).pipe(res);
  } else { res.writeHead(200, Object.assign(h, { 'Content-Length': size })); fs.createReadStream(f).pipe(res); }
}
const port = +(process.argv[2] || 8443);
https.createServer({ key: fs.readFileSync(path.join(D, 'key.pem')), cert: fs.readFileSync(path.join(D, 'cert.pem')) }, serve).listen(port, () => console.log('mock on', port));
// CONNECT proxy (works with every Chromium version): Met hosts -> the mock, everything else -> the real host.
const net = require('net'), httpMod = require('http');
const proxy = httpMod.createServer((req, res) => { res.writeHead(405); res.end(); });
proxy.on('connect', (req, sock, head) => {
  const [host, p] = req.url.split(':');
  const mock = /(^|\.)ondemand\.metopera\.org$/.test(host);
  const up = net.connect(mock ? port : +(p || 443), mock ? '127.0.0.1' : host, () => { sock.write('HTTP/1.1 200 Connection Established\r\n\r\n'); if (head && head.length) up.write(head); up.pipe(sock); sock.pipe(up); });
  up.on('error', () => sock.destroy()); sock.on('error', () => up.destroy());
});
proxy.listen(port + 1, () => console.log('proxy on', port + 1));
