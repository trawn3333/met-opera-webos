// webOS / LG Magic Remote key codes (plus desktop equivalents for testing).
export var KEY = {
  LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40,
  ENTER: 13,
  BACK: 461,
  ESC: 27,          // desktop stand-in for Back
  BACKSPACE: 8,     // desktop stand-in for Back (ignored while typing)
  PLAY: 415,
  PAUSE: 19,
  PLAY_PAUSE: 179,  // some remotes / keyboards
  STOP: 413,
  FF: 417,
  RW: 412,
  RED: 403,
  GREEN: 404,
  YELLOW: 405,
  BLUE: 406
};

export function isTyping(el) {
  if (!el) return false;
  var tag = el.tagName;
  if (tag === 'TEXTAREA' || el.isContentEditable) return true;
  if (tag !== 'INPUT') return false;
  var t = (el.type || 'text').toLowerCase();
  return ['button', 'submit', 'checkbox', 'radio', 'range', 'reset', 'image'].indexOf(t) === -1;
}
