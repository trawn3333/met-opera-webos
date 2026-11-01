var el = null;
var timer = null;

export function toast(text, ms) {
  if (!el || !document.documentElement.contains(el)) {
    el = document.createElement('div');
    el.className = 'mtv-toast';
    document.body.appendChild(el);
  }
  el.textContent = text;
  el.style.display = 'block';
  clearTimeout(timer);
  timer = setTimeout(function () { el.style.display = 'none'; }, ms || 3000);
}
