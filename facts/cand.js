const fs = require('fs');
const f = process.argv[2], max = +(process.argv[3] || 60);
const txt = fs.readFileSync(f, 'utf8');
const KW = /premiere|première|reaction|audience|critic|review|wrote|letter|said|called|described|famous|accident|mishap|fell|disaster|fiasco|failure|success|encore|Metropolitan|Met |censor|banned|scandal|inspired|aria|duet|quartet|chorus|overture|prelude|quintet|sextet|trio|march|whistl|hiss|riot|ovation|composer himself|first performance|revis|record|longest|shortest|high C|cut/i;
let sec = '';
const out = [];
for (const para of txt.split('\n')) {
  const h = /^=+\s*(.*?)\s*=+$/.exec(para.trim());
  if (h) { sec = h[1]; continue; }
  if (/^(Roles|Recordings|References|Notes|Sources|Further reading|External links|Discography|Cited sources|Bibliography)$/i.test(sec)) continue;
  for (const s of para.split(/(?<=[.!?])\s+(?=[A-Z"“])/)) if (KW.test(s) && s.length > 50 && s.length < 420) out.push('[' + sec + '] ' + s);
}
console.log(out.slice(0, max).join('\n'));
console.log('-- ' + out.length + ' candidates');
