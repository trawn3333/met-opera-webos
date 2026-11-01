#!/usr/bin/env bash
# Usage: ./query.sh summary [since]          e.g. ./query.sh summary 7d
#        ./query.sh events 'since=24h&type=error&limit=50'
#        ./query.sh reports ['since=7d&limit=20']   list problem reports (metadata + summary)
#        ./query.sh report <id> [out.json]          fetch one report (decompressed JSON; default ./reports/report-<id>.json)
#        ./query.sh report-dom <id> [out.html]      extract the sanitized DOM snapshot of a report as HTML
# Reads MTV_WORKER_URL + MTV_TELEMETRY_READ_TOKEN from the repo-root .env (never printed). Pipe to `python3 -m json.tool` or `jq` for pretty output.
set -eu; cd "$(dirname "$0")"
cfg="$(node ../scripts/env.js --sh MTV_WORKER_URL MTV_TELEMETRY_READ_TOKEN)" || exit 2; eval "$cfg"
U="${MTV_WORKER_URL%/}"; READ_TOKEN="$MTV_TELEMETRY_READ_TOKEN"
case "${1:-summary}" in
  summary) curl -s "$U/v1/summary?since=${2:-7d}" -H "Authorization: Bearer $READ_TOKEN" ;;
  events)  curl -s "$U/v1/events?${2:-since=24h}" -H "Authorization: Bearer $READ_TOKEN" ;;
  reports) curl -s "$U/v1/reports?${2:-since=7d}" -H "Authorization: Bearer $READ_TOKEN" ;;
  report)  mkdir -p reports; o="${3:-reports/report-$2.json}"
           curl -sf "$U/v1/reports/$2" -H "Authorization: Bearer $READ_TOKEN" -o "$o" && echo "saved $o ($(wc -c < "$o") bytes)" ;;
  report-dom) mkdir -p reports; j="reports/report-$2.json"; [ -f "$j" ] || curl -sf "$U/v1/reports/$2" -H "Authorization: Bearer $READ_TOKEN" -o "$j"
           o="${3:-reports/report-$2.html}"; python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); open(sys.argv[2],"w").write((d.get("snapshot") or {}).get("dom") or "")' "$j" "$o" && echo "saved $o" ;;
  *) echo "usage: $0 summary [since] | events 'query' | reports ['query'] | report <id> [out] | report-dom <id> [out]" >&2; exit 1 ;;
esac
