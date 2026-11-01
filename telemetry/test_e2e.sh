#!/usr/bin/env bash
# End-to-end test for met-tv-telemetry. Reads the URL and keys from the repo-root .env; never prints them.
set -u
cd "$(dirname "$0")"
cfg="$(node ../scripts/env.js --sh MTV_WORKER_URL MTV_TELEMETRY_INGEST_KEY MTV_TELEMETRY_READ_TOKEN)" || exit 2; eval "$cfg"
U="${MTV_WORKER_URL%/}"; INGEST_KEY="$MTV_TELEMETRY_INGEST_KEY"; READ_TOKEN="$MTV_TELEMETRY_READ_TOKEN"
DEV="e2e-test-$(date +%s)"
pass=0; fail=0
chk() { if [ "$2" = "$3" ]; then echo "PASS $1 ($3)"; pass=$((pass+1)); else echo "FAIL $1 (want $2 got $3)"; fail=$((fail+1)); fi; }
code() { curl -s -o /tmp/tlm_body -w '%{http_code}' "$@"; }
NOW=$(($(date +%s)*1000))
BODY=$(cat <<J
{"deviceId":"$DEV","appVersion":"1.0.2-test","sessionId":"s-e2e-1","ua":"Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 Chrome/79.0.3945.79 Safari/537.36 WebAppManager",
 "events":[
  {"ts":$NOW,"type":"lifecycle","message":"launch","data":{"cold":true}},
  {"ts":$NOW,"type":"error","message":"TypeError: x is undefined","source":"https://ondemand.metopera.org/static/js/main.js","line":1,"col":2345,"stack":"at a (main.js:1:2345)","url":"https://ondemand.metopera.org/","data":{"password":"hunter2","nested":{"token":"abc"},"note":"saved {\"u\":\"me@x.com\",\"p\":\"=gHe\"}"}},
  {"ts":$NOW,"type":"warn","message":"slow load password=hunter2"},
  {"ts":$NOW,"type":"usage","message":"play","data":{"title":"Tosca"}},
  {"ts":$NOW,"type":"console","message":"hello"},
  {"ts":$NOW,"type":"bogus","message":"should be rejected"}
 ]}
J
)
chk "ingest valid batch" 200 "$(code -X POST $U/v1/events -H "X-Met-Key: $INGEST_KEY" -H 'Content-Type: application/json' -H 'Origin: https://ondemand.metopera.org' --data "$BODY")"; cat /tmp/tlm_body; echo
chk "ingest via ?k= text/plain (beacon style)" 200 "$(code -X POST "$U/v1/events?k=$INGEST_KEY" -H 'Content-Type: text/plain' --data "{\"deviceId\":\"$DEV\",\"appVersion\":\"1.0.2-test\",\"sessionId\":\"s-e2e-2\",\"events\":[{\"type\":\"lifecycle\",\"message\":\"pagehide\"}]}")"
chk "ingest missing key" 401 "$(code -X POST $U/v1/events --data "$BODY")"
chk "ingest wrong key" 401 "$(code -X POST $U/v1/events -H 'X-Met-Key: nope' --data "$BODY")"
chk "ingest bad JSON" 400 "$(code -X POST $U/v1/events -H "X-Met-Key: $INGEST_KEY" --data '{bad')"
chk "ingest no deviceId" 400 "$(code -X POST $U/v1/events -H "X-Met-Key: $INGEST_KEY" --data '{"events":[{"type":"error"}]}')"
BIG=$(python3 -c "import json;print(json.dumps({'deviceId':'$DEV','events':[{'type':'console','message':'x'}]*101}))")
chk "ingest >100 events" 413 "$(code -X POST $U/v1/events -H "X-Met-Key: $INGEST_KEY" --data "$BIG")"
HUGE=$(python3 -c "import json;print(json.dumps({'deviceId':'$DEV','events':[{'type':'console','message':'x'*70000}]}))")
chk "ingest >64KB" 413 "$(code -X POST $U/v1/events -H "X-Met-Key: $INGEST_KEY" --data "$HUGE")"
chk "CORS preflight" 204 "$(code -X OPTIONS $U/v1/events -H 'Origin: null' -H 'Access-Control-Request-Method: POST' -H 'Access-Control-Request-Headers: x-met-key,content-type')"
chk "CORS header on POST" "*" "$(curl -s -D - -o /dev/null -X POST $U/v1/events -H 'Origin: null' -H "X-Met-Key: $INGEST_KEY" --data '{}' | tr -d '\r' | awk -F': ' 'tolower($1)=="access-control-allow-origin"{print $2}')"
chk "read without token" 401 "$(code $U/v1/events)"
chk "read wrong token" 401 "$(code $U/v1/summary -H 'Authorization: Bearer wrong')"
chk "read with ingest key rejected" 401 "$(code $U/v1/events -H "Authorization: Bearer $INGEST_KEY")"
chk "read events" 200 "$(code "$U/v1/events?since=10m&limit=50&deviceId=$DEV" -H "Authorization: Bearer $READ_TOKEN")"
python3 - <<'P'
import json; d=json.load(open('/tmp/tlm_body'))
print('  events read back:', d['count'], sorted(set(e['type'] for e in d['events'])))
blob=json.dumps(d)
print('  scrub: hunter2 absent =', 'hunter2' not in blob, '| =gHe absent =', '=gHe' not in blob, '| abc token absent =', '"abc"' not in blob)
e=[x for x in d['events'] if x['type']=='error'][0]; print('  error data:', json.dumps(e['data']), '| engine:', e['engine'])
P
chk "read filtered type=error" 200 "$(code "$U/v1/events?since=10m&type=error&deviceId=$DEV" -H "Authorization: Bearer $READ_TOKEN")"
python3 -c "import json;d=json.load(open('/tmp/tlm_body'));print('  type=error count:',d['count'])"
chk "summary" 200 "$(code "$U/v1/summary?since=1h" -H "Authorization: Bearer $READ_TOKEN")"
python3 -c "
import json;d=json.load(open('/tmp/tlm_body'))
print('  countsByType:',d['countsByType']); print('  appVersions:',[v['app_version'] for v in d['appVersions']]); print('  engines:',[v['engine'] for v in d['engineVersions']]); print('  sessions:',len(d['sessions']),' latestErrors:',len(d['latestErrors']))"
# rate limit: 30 req/min per device
RL=""; for i in $(seq 1 32); do RL=$(code -X POST $U/v1/events -H "X-Met-Key: $INGEST_KEY" --data "{\"deviceId\":\"rl-$DEV\",\"events\":[{\"type\":\"usage\",\"message\":\"rl\"}]}"); done
chk "rate limit after 30 req/min" 429 "$RL"
chk "manual cleanup endpoint" 200 "$(code -X POST $U/v1/cleanup -H "Authorization: Bearer $READ_TOKEN")"; cat /tmp/tlm_body; echo
echo "== $pass passed, $fail failed"
