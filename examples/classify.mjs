// キャプチャした Streamable HTTP の 1 往復を、2026-07-28（modern）か legacy かに振り分ける。
//   node examples/classify.mjs examples/captures.json
// 入力: [{ label, request: { method, headers, body }, response?: { status, body } }]
import { readFileSync } from 'node:fs';

const MODERN_ERRORS = new Map([[-32020, 'HeaderMismatch'], [-32021, 'MissingRequiredClientCapability'],
  [-32022, 'UnsupportedProtocolVersion'], [-32601, 'Method not found']]);
const META_VERSION = 'io.modelcontextprotocol/protocolVersion';

const lower = (h = {}) => Object.fromEntries(Object.entries(h).map(([k, v]) => [k.toLowerCase(), v]));
const decode = (v) => v?.match(/^=\?base64\?(.*)\?=$/) ? Buffer.from(RegExp.$1, 'base64').toString('utf8') : v;

function era({ method, headers, body }) {
  const h = lower(headers);
  if (method === 'GET') return ['legacy', 'GET の SSE 待ち受けは 2025-11-25 まで'];
  if (method === 'DELETE') return ['legacy', 'DELETE でのセッション終了は 2025-11-25 まで'];
  if (body?.method === 'initialize') return ['legacy', 'initialize で始まる'];
  if (h['mcp-session-id']) return ['legacy', 'MCP-Session-Id を付けている'];
  if (body?.params?._meta?.[META_VERSION]) return ['modern', `_meta に ${META_VERSION}`];
  const v = h['mcp-protocol-version'];
  if (!v) return ['legacy', 'MCP-Protocol-Version が無い（2025-03-26 として扱われる）'];
  return v >= '2026-07-28' ? ['modern?', `ヘッダーは ${v} だが _meta が無い`] : ['legacy', `MCP-Protocol-Version: ${v}`];
}

// modern のリクエストで、ヘッダーと本文が食い違う箇所（サーバーは 400 と -32020 で拒否する）
function mismatches({ headers, body }) {
  const h = lower(headers), out = [];
  const pairs = [['mcp-protocol-version', body?.params?._meta?.[META_VERSION]], ['mcp-method', body?.method]];
  if (['tools/call', 'resources/read', 'prompts/get'].includes(body?.method)) pairs.push(['mcp-name', body.params.name ?? body.params.uri]);
  for (const [k, want] of pairs) {
    const got = k === 'mcp-name' ? decode(h[k]) : h[k];
    if (got === undefined) out.push(`${k} が無い`);
    else if (got !== want) out.push(`${k}: ヘッダー ${JSON.stringify(got)} ≠ 本文 ${JSON.stringify(want)}`);
  }
  return out;
}

// Dual-era クライアントが、この応答を見てどうするか
function fallback(res) {
  if (!res) return null;
  const code = res.body?.error?.code;
  if (res.status >= 400 && res.status < 500) {
    return MODERN_ERRORS.has(code)
      ? `modern サーバー（${code} ${MODERN_ERRORS.get(code)}）→ フォールバックしない`
      : `${res.status} に modern のエラーが無い → initialize へフォールバック`;
  }
  if (res.body?.result) return 'resultType' in res.body.result
    ? `modern の結果（resultType: ${res.body.result.resultType}）`
    : 'resultType が無い結果 → 旧版サーバーの complete として扱う';
  return null;
}

for (const c of JSON.parse(readFileSync(process.argv[2], 'utf8'))) {
  const [e, why] = era(c.request);
  console.log(`${c.label}: ${e} — ${why}`);
  if (e === 'modern') for (const m of mismatches(c.request)) console.log(`  不一致: ${m}`);
  const f = fallback(c.response);
  if (f) console.log(`  応答: ${f}`);
}
