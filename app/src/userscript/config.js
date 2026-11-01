// Build-time configuration, injected by build.js (esbuild define) from the repo-root .env.
// Nothing secret or deployment-specific lives in source. See /.env.example and README "Configuration".
/* global __MTV_WORKER_URL__, __MTV_TLM_ON__, __MTV_TLM_KEY__ */
export var WORKER_URL = typeof __MTV_WORKER_URL__ !== 'undefined' ? __MTV_WORKER_URL__ : '';
// Telemetry + problem reports exist only when the build had MTV_TELEMETRY_INGEST_KEY; otherwise they are no-ops.
export var TLM_BUILT = typeof __MTV_TLM_ON__ !== 'undefined' ? !!__MTV_TLM_ON__ && !!WORKER_URL : false;
export var TLM_KEY = TLM_BUILT && typeof __MTV_TLM_KEY__ !== 'undefined' ? __MTV_TLM_KEY__ : '';
