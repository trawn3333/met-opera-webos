// Early-injected test shim: removes JS/DOM APIs that Chromium 54-58 added, so Chromium 59 behaves more like 53 (webOS 4.x).
(function () {
  function del(o, k) { try { delete o[k]; } catch (e) {} }
  del(Object, 'values'); del(Object, 'entries'); del(Object, 'getOwnPropertyDescriptors');
  del(String.prototype, 'padStart'); del(String.prototype, 'padEnd');
  ['append', 'prepend'].forEach(function (k) { del(Element.prototype, k); del(Document.prototype, k); del(DocumentFragment.prototype, k); });
  ['before', 'after', 'replaceWith'].forEach(function (k) { del(Element.prototype, k); del(CharacterData.prototype, k); });
  del(Node.prototype, 'isConnected');
  if (window.IntersectionObserverEntry) del(IntersectionObserverEntry.prototype, 'isIntersecting');
  del(window, 'PointerEvent');
})();
