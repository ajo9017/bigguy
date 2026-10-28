#!/usr/bin/env bash
# Claude 구독의 주간(7일) 사용량을 0~100 숫자로 출력한다. 못 읽으면 아무것도 출력하지 않는다.
# 진단 내용은 stderr로 남긴다(토큰은 찍지 않는다). 필요한 환경변수: OAUTH (CLAUDE_CODE_OAUTH_TOKEN)
set -u
[ -z "${OAUTH:-}" ] && { echo "CLAUDE_CODE_OAUTH_TOKEN이 없음" >&2; exit 0; }
tmp=$(mktemp -d)

# 1) 사용량 조회 API
code=$(curl -s -o "$tmp/u.json" -w '%{http_code}' --max-time 15 https://api.anthropic.com/api/oauth/usage \
  -H "Authorization: Bearer $OAUTH" -H "anthropic-beta: oauth-2025-04-20")
echo "usage API: HTTP $code $(head -c 300 "$tmp/u.json")" >&2
v=$(python3 -c "
import json, sys
d = json.load(open('$tmp/u.json'))
u = (d.get('seven_day') or {}).get('utilization')
print(u if u is not None else '')
" 2>/dev/null)
[ -n "$v" ] && { echo "$v"; exit 0; }

# 2) 아주 짧은 메시지 요청의 응답 헤더(unified 7일 사용률, 0~1)
code=$(curl -s -D "$tmp/h.txt" -o "$tmp/m.json" -w '%{http_code}' --max-time 30 https://api.anthropic.com/v1/messages \
  -H "Authorization: Bearer $OAUTH" -H "anthropic-beta: oauth-2025-04-20" -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{"model":"claude-haiku-5-5","max_tokens":1,"system":"You are Claude Code, Anthropic'"'"'s official CLI for Claude.","messages":[{"role":"user","content":"hi"}]}')
echo "messages API: HTTP $code $(head -c 300 "$tmp/m.json")" >&2
grep -i '^anthropic-ratelimit-unified' "$tmp/h.txt" >&2 || true
v=$(grep -i '^anthropic-ratelimit-unified-7d-utilization:' "$tmp/h.txt" | head -1 | cut -d: -f2 | tr -d ' \r')
[ -n "$v" ] && python3 -c "print(round(float('$v') * 100, 1))"
exit 0
