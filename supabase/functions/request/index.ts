// Supabase Edge Function "clever-api" (대시보드에서 만들 때 붙은 이름. 코드 폴더 이름은 request): 게임 안 개선 요청을 GitHub 이슈로 만든다.
// GitHub 토큰은 이 서버에만 있고 게임 코드에는 들어가지 않는다.
//
// 필요한 Secret (Supabase 대시보드 → Edge Functions → Secrets)
//   GITHUB_TOKEN: bigguy 저장소의 Issues 읽기/쓰기 권한만 있는 fine-grained 토큰
//   OWNER_CODE:   주인 확인용 암호. 게임에서 이 코드를 넣고 보낸 요청만 바로 자동 반영된다
// 함수 설정에서 JWT 검증(Verify JWT)은 꺼야 한다. 게임은 로그인 없이 호출한다.

const REPO = 'ajo9017/bigguy';
// 이 표시가 있는 이슈는 자동 반영 워크플로가 바로 작업하지 않는다 (주인이 '반영' 댓글을 달아야 함)
const PLAYER_MARK = '<!-- bigguy:player -->';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'apikey, authorization, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

// @멘션으로 다른 GitHub 사용자를 호출하지 못하게 막는다
const clean = (v: unknown, max: number) => String(v ?? '').replace(/@/g, '@​').trim().slice(0, max);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'POST만 받아요' });

  let data: Record<string, unknown>;
  try {
    data = await req.json();
  } catch {
    return json(400, { error: '잘못된 요청 형식' });
  }

  const text = clean(data.text, 1000);
  if (text.length < 2) return json(400, { error: '요청 내용이 너무 짧아요' });
  const name = clean(data.name, 12) || '익명';
  const info = clean(data.info, 300);

  const ownerCode = Deno.env.get('OWNER_CODE');
  const isOwner = !!ownerCode && data.code === ownerCode;

  const title = '[요청] ' + text.replace(/\s+/g, ' ').slice(0, 60);
  const body = `${text}\n\n---\n보낸 사람: ${name}${isOwner ? ' (주인)' : ''}\n${info}` + (isOwner ? '' : `\n\n${PLAYER_MARK}`);

  const res = await fetch(`https://api.github.com/repos/${REPO}/issues`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${Deno.env.get('GITHUB_TOKEN')}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'bigguy-request',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ title, body }),
  });
  if (!res.ok) return json(502, { error: 'GitHub 이슈를 만들지 못했어요', status: res.status });

  const issue = await res.json();
  return json(200, { number: issue.number, url: issue.html_url, owner: isOwner });
});
