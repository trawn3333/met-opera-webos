// Build: bundle userscript (esbuild) -> transpile to ES5 (Babel) -> minify (esbuild, ES5 target)
// -> verify ES5 with acorn -> assemble dist/ for ares-package.
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');
const babel = require('@babel/core');
const acorn = require('acorn');

const root = __dirname;
const dist = path.join(root, 'dist');
const pkg = require('./package.json');
// Config comes from the repo-root .env (never from source). Validates and exits on errors; telemetry is optional.
const { loadEnv } = require('../scripts/env.js');

async function main() {
  const { env, features } = loadEnv('build');
  const define = {
    __MTV_VERSION__: JSON.stringify(pkg.version),
    __MTV_WORKER_URL__: JSON.stringify(env.MTV_WORKER_URL.replace(/\/+$/, '')),
    __MTV_TLM_ON__: JSON.stringify(!!features.telemetry),
    __MTV_TLM_KEY__: JSON.stringify(features.telemetry ? env.MTV_TELEMETRY_INGEST_KEY : '')
  };
  fs.rmSync(dist, { recursive: true, force: true });
  fs.mkdirSync(path.join(dist, 'webOSUserScripts'), { recursive: true });

  const bundled = await esbuild.build({
    entryPoints: [path.join(root, 'src/userscript/index.js')],
    bundle: true,
    format: 'iife',
    target: 'es2015',
    loader: { '.css': 'text', '.idx': 'text' },
    define,
    write: false,
    legalComments: 'none'
  });
  let code = bundled.outputFiles[0].text;

  code = babel.transformSync(code, {
    babelrc: false,
    configFile: false,
    presets: [['@babel/preset-env', { targets: { chrome: '38' }, forceAllTransforms: true, modules: false, loose: true }]],
    compact: false
  }).code;

  if (!process.argv.includes('--debug')) {
    code = (await esbuild.transform(code, { minify: true, target: 'es5' })).code;
  }

  // Wrap so the script can re-inject itself at the top of a restarted page (recover.js uses
  // window.__mtvMain.toString()).
  code = 'window.__mtvMain=function(){\n' + code + '\n};window.__mtvMain();\n';

  // Fail the build if anything newer than ES5 slipped through.
  acorn.parse(code, { ecmaVersion: 5, sourceType: 'script' });

  const banner = `/* Met Opera TV userscript v${pkg.version} — personal use. Built ${new Date().toISOString()} */\n`;
  fs.writeFileSync(path.join(dist, 'webOSUserScripts/userScript.js'), banner + code);

  const appinfo = JSON.parse(fs.readFileSync(path.join(root, 'src/app/appinfo.json'), 'utf8'));
  appinfo.version = pkg.version;
  fs.writeFileSync(path.join(dist, 'appinfo.json'), JSON.stringify(appinfo, null, 2));
  fs.writeFileSync(path.join(dist, 'index.html'), fs.readFileSync(path.join(root, 'src/app/index.html'), 'utf8').replace(/__MTV_VERSION__/g, pkg.version));
  for (const f of ['icon.png', 'largeIcon.png', 'splash.png']) {
    fs.copyFileSync(path.join(root, 'assets', f), path.join(dist, f));
  }
  console.log(`built dist/ (userScript.js ${(code.length / 1024).toFixed(1)} KB, ES5 verified, telemetry ${features.telemetry ? 'ON' : 'OFF (compiled out)'})`);
}

main().catch((e) => { console.error(e); process.exit(1); });
