// Device / engine / codec facts for the GREEN debug overlay.
var CHROME_TO_WEBOS = { 38: '3.x', 53: '4.x', 68: '5.x', 79: '6.x', 87: '22', 94: '23', 108: '24', 120: '25', 132: '26' };
var cachedCodecs = null;
var cachedDevice = null;

function chromeVersion() {
  var m = /Chrome\/([\d.]+)/.exec(navigator.userAgent);
  return m ? m[1] : null;
}

// LG model-year code: OLED55B8 / 55UK6300 / OLED65C9 / OLED55CX / OLED55C1 ...
var YEAR_OS = { 2016: '3.0', 2017: '3.5', 2018: '4.0', 2019: '4.5', 2020: '5.0', 2021: '6.0', 2022: '22', 2023: '23', 2024: '24', 2025: '25' };
function modelYear(m) {
  m = String(m || '');
  var y = 0, r;
  if ((r = /^OLED\d{2}[A-Z]([0-9X])/.exec(m))) y = r[1] === 'X' ? 2020 : 2010 + +r[1];
  else if ((r = /^\d{2}(U[HJKMN]|S[JKMN]|NANO)/.exec(m))) y = { UH: 2016, UJ: 2017, SJ: 2017, UK: 2018, SK: 2018, UM: 2019, SM: 2019, UN: 2020, SN: 2020 }[r[1]] || 0;
  if (y && y < 2016) y += 10; // OLED B6 etc. would be 2016; digits 0-5 mean 202x
  return y && YEAR_OS[y] ? { y: y, os: YEAR_OS[y] } : null;
}

function deviceInfo() {
  if (cachedDevice !== null) return cachedDevice;
  cachedDevice = '';
  try {
    var sys = window.webOSSystem || window.PalmSystem;
    if (sys && sys.deviceInfo) {
      var d = typeof sys.deviceInfo === 'string' ? JSON.parse(sys.deviceInfo) : sys.deviceInfo;
      var parts = [];
      if (d.modelName) parts.push(d.modelName);
      var yr = modelYear(d.modelName);
      if (yr) parts.push(yr.y + ' model (ships with webOS ' + yr.os + ')');
      // platformVersion is LG's platform/firmware build (e.g. 05.50.70 on a 2018 webOS 4.0 set), not the webOS release.
      if (d.platformVersion) parts.push('platform build ' + d.platformVersion);
      if (d.platformVersionMajor !== undefined) parts.push('platform ' + d.platformVersionMajor + '.' + (d.platformVersionMinor || 0));
      if (d.sdkVersion) parts.push('SDK ' + d.sdkVersion);
      if (d.screenWidth) parts.push('panel ' + d.screenWidth + 'x' + d.screenHeight);
      cachedDevice = parts.join(', ');
    }
  } catch (e) { cachedDevice = 'deviceInfo error: ' + e.message; }
  return cachedDevice;
}

function codecs() {
  if (cachedCodecs) return cachedCodecs;
  var out = [];
  try {
    var v = document.createElement('video');
    var cp = function (label, type) { var r = ''; try { r = v.canPlayType(type); } catch (e) { r = 'err'; } out.push(label + '=' + (r || 'no')); };
    cp('H.264 mp4', 'video/mp4; codecs="avc1.640028, mp4a.40.2"');
    cp('HLS', 'application/vnd.apple.mpegurl');
    cp('DASH', 'application/dash+xml');
    var MS = window.MediaSource || window.WebKitMediaSource;
    if (MS && typeof MS.isTypeSupported === 'function') {
      var ms = function (label, type) { var r = false; try { r = MS.isTypeSupported(type); } catch (e) { /* no */ } out.push(label + '=' + (r ? 'yes' : 'no')); };
      ms('MSE H.264', 'video/mp4; codecs="avc1.640028"');
      ms('MSE AAC', 'audio/mp4; codecs="mp4a.40.2"');
      ms('MSE HEVC', 'video/mp4; codecs="hvc1.1.6.L120.90"');
      ms('MSE VP9', 'video/webm; codecs="vp9"');
    } else out.push('MSE=none');
    out.push('EME=' + (navigator.requestMediaKeySystemAccess ? 'yes' : 'no'));
  } catch (e) { out.push('error ' + e.message); }
  cachedCodecs = out.join(', ');
  return cachedCodecs;
}

function timing() {
  try {
    var t = performance.timing;
    var ns = t.navigationStart;
    return { load: t.loadEventEnd > 0 ? t.loadEventEnd - ns : null, dcl: t.domContentLoadedEventEnd > 0 ? t.domContentLoadedEventEnd - ns : null };
  } catch (e) { return { load: null, dcl: null }; }
}

export function envInfo() {
  var cv = chromeVersion();
  var major = cv ? parseInt(cv, 10) : 0;
  var webosUA = /Web0S|webOS/i.test(navigator.userAgent);
  var guess = CHROME_TO_WEBOS[major];
  return {
    platform: (cv ? 'Chromium ' + cv : 'unknown engine') +
      (webosUA ? (guess ? ' \u2192 webOS ' + guess : ' (webOS)') : ' (not a webOS UA)'),
    device: deviceInfo() || '-',
    screen: 'screen ' + screen.width + 'x' + screen.height + ', window ' + window.innerWidth + 'x' + window.innerHeight +
      ', devicePixelRatio ' + (window.devicePixelRatio || 1),
    codecs: codecs(),
    timing: timing()
  };
}
