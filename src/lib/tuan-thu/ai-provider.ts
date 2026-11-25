/**
 * Lớp gọi mô hình AI cho phần Tuân thủ bảng kê — chọn nhà cung cấp bằng biến môi trường:
 *   AI_PROVIDER = 'openai' | 'anthropic'   (không đặt: có OPENAI_API_KEY thì dùng OpenAI, không thì Anthropic)
 *   OpenAI:    OPENAI_API_KEY, OPENAI_AGENT_MODEL (không đặt thì dùng OPENAI_MODEL, rồi 'gpt-4.1')
 *   Anthropic: ANTHROPIC_API_KEY, ANTHROPIC_MODEL (mặc định claude-sonnet-5-5)
 *
 * Mọi nơi trong code gọi theo MỘT định dạng chung (giống Messages API: system, messages gồm khối text / image /
 * document / tool_use / tool_result, tools, tool_choice). Khi dùng OpenAI, lớp này tự chuyển sang Chat Completions
 * (function calling, ảnh, file PDF) và chuyển kết quả về lại định dạng chung — code nghiệp vụ không phải đổi.
 */
export type YeuCauAI = { system?: string; messages: any[]; tools?: any[]; tool_choice?: any; max_tokens: number };
export type KetQuaAI = { content: any[]; stop_reason: string; model: string };

export const NHA_CUNG_CAP = (): 'openai' | 'anthropic' => {
  const p = (process.env.AI_PROVIDER ?? '').toLowerCase();
  if (p === 'openai' || p === 'anthropic') return p;
  return process.env.OPENAI_API_KEY ? 'openai' : 'anthropic';
};
export const TEN_MO_HINH = () => (NHA_CUNG_CAP() === 'openai'
  ? (process.env.OPENAI_AGENT_MODEL || process.env.OPENAI_MODEL || 'gpt-4.1')
  : (process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5'));

export async function goiMoHinh(req: YeuCauAI): Promise<KetQuaAI> {
  return NHA_CUNG_CAP() === 'openai' ? goiOpenAI(req) : goiAnthropic(req);
}

async function goiAnthropic(req: YeuCauAI): Promise<KetQuaAI> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('Chưa cấu hình ANTHROPIC_API_KEY trên Vercel (hoặc đặt AI_PROVIDER=openai để dùng OpenAI).');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: TEN_MO_HINH(), ...req }),
  });
  const d: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Model không hỗ trợ ép gọi công cụ → gọi lại ở chế độ tự chọn
    if (req.tool_choice && /tool_choice/i.test(d?.error?.message ?? '')) return goiAnthropic({ ...req, tool_choice: undefined });
    throw new Error(`Claude API lỗi ${res.status}: ${d?.error?.message ?? 'không rõ'}`);
  }
  return { content: d.content ?? [], stop_reason: d.stop_reason ?? 'end_turn', model: TEN_MO_HINH() };
}

// ---------------------------------------------------------------------
// OpenAI Chat Completions
// ---------------------------------------------------------------------
function khoiSangOpenAI(b: any): any | null {
  if (b.type === 'text') return { type: 'text', text: b.text };
  if (b.type === 'image' && b.source?.type === 'base64') return { type: 'image_url', image_url: { url: `data:${b.source.media_type};base64,${b.source.data}` } };
  if (b.type === 'document' && b.source?.type === 'base64') return { type: 'file', file: { filename: b.title || 'tai-lieu.pdf', file_data: `data:${b.source.media_type};base64,${b.source.data}` } };
  return null;
}

function tinNhanSangOpenAI(system: string | undefined, messages: any[]): any[] {
  const out: any[] = [];
  if (system) out.push({ role: 'system', content: system });
  for (const m of messages) {
    if (typeof m.content === 'string') { out.push({ role: m.role, content: m.content }); continue; }
    const blocks: any[] = m.content ?? [];
    if (m.role === 'assistant') {
      const text = blocks.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
      const calls = blocks.filter((b) => b.type === 'tool_use').map((b) => ({ id: b.id, type: 'function', function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) } }));
      out.push({ role: 'assistant', content: text || null, ...(calls.length ? { tool_calls: calls } : {}) });
      continue;
    }
    // user: kết quả công cụ tách thành tin nhắn role 'tool'; phần còn lại là nội dung người dùng
    for (const b of blocks.filter((x) => x.type === 'tool_result'))
      out.push({ role: 'tool', tool_call_id: b.tool_use_id, content: typeof b.content === 'string' ? b.content : JSON.stringify(b.content) });
    const khac = blocks.filter((x) => x.type !== 'tool_result').map(khoiSangOpenAI).filter(Boolean);
    if (khac.length) out.push({ role: 'user', content: khac });
  }
  return out;
}

async function goiOpenAI(req: YeuCauAI): Promise<KetQuaAI> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('Chưa cấu hình OPENAI_API_KEY trên Vercel.');
  const body: any = { model: TEN_MO_HINH(), messages: tinNhanSangOpenAI(req.system, req.messages), max_completion_tokens: req.max_tokens };
  if (req.tools?.length) {
    body.tools = req.tools.map((t: any) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.input_schema } }));
    if (req.tool_choice?.type === 'tool') body.tool_choice = { type: 'function', function: { name: req.tool_choice.name } };
  }
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` }, body: JSON.stringify(body),
  });
  const d: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`OpenAI API lỗi ${res.status}: ${d?.error?.message ?? 'không rõ'}`);
  const c = d.choices?.[0] ?? {}; const msg = c.message ?? {};
  const content: any[] = [];
  if (msg.content) content.push({ type: 'text', text: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content) });
  for (const tc of msg.tool_calls ?? []) {
    let input: any = {};
    try { input = JSON.parse(tc.function?.arguments || '{}'); } catch { input = {}; if (c.finish_reason !== 'length') throw new Error(`OpenAI trả tham số công cụ ${tc.function?.name} không đọc được.`); }
    content.push({ type: 'tool_use', id: tc.id, name: tc.function?.name, input });
  }
  const stop = c.finish_reason === 'length' ? 'max_tokens' : (msg.tool_calls?.length ? 'tool_use' : 'end_turn');
  return { content, stop_reason: stop, model: TEN_MO_HINH() };
}
