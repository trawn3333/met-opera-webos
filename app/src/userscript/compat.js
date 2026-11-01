// Compatibility repairs for old engines. Nothing is intercepted or blocked: these only react AFTER
// something has already failed, doing what newer browsers do automatically.
import { dbg } from './debugLog';

var fixedImgs = 0;
export function getCompatStats() { return { imagesRetriedOverHttps: fixedImgs }; }

// The Met's tile artwork is referenced as http://www.metopera.org/... (mixed content). Chrome 86+
// silently upgrades such images to https; older engines (webOS 4/5) request http, which fails (HTTP 500).
// When one of those images fails to load, retry the same file over https.
export function repairMixedContentImages() {
  window.addEventListener('error', function (e) {
    var t = e.target;
    if (!t || t.tagName !== 'IMG') return;
    var src = t.getAttribute('src') || '';
    if (/^http:\/\/www\.metopera\.org\//i.test(src) && !t.__mtvHttpsRetry) {
      t.__mtvHttpsRetry = true;
      fixedImgs++;
      t.setAttribute('src', 'https://' + src.slice(7));
      if (fixedImgs === 1) dbg('info', 'retrying http:// Met images over https (old engine has no mixed-content upgrade)');
    }
  }, true);
}
