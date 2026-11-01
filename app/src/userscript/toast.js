var el = null;
var timer = null;

export function toast(text, ms, html) {
  if (!el || !document.documentElement.contains(el)) {
    el = document.createElement('div');
    el.className = 'mtv-toast';
    document.body.appendChild(el);
  }
  if (html) el.innerHTML = text; else el.textContent = text;
  el.className = 'mtv-toast' + (html ? ' mtv-toast-rich' : '');
  el.style.display = 'block';
  clearTimeout(timer);
  timer = setTimeout(function () { el.style.display = 'none'; }, ms || 3000);
}
