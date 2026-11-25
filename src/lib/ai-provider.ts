import OpenAI from 'openai';

/**
 * Chọn nhà cung cấp AI cho toàn app.
 * - Mặc định: OpenAI (GPT) — khi AI_PROVIDER trống hoặc khác "anthropic".
 * - AI_PROVIDER=anthropic → dùng Claude (ANTHROPIC_API_KEY, ANTHROPIC_MODEL).
 * Không tự chuyển bên khi thiếu khoá: nếu chọn Claude mà thiếu key thì báo "chưa sẵn sàng".
 */
export type AIProvider = 'openai' | 'anthropic';

export function aiProvider(): AIProvider {
  return (process.env.AI_PROVIDER || '').trim().toLowerCase() === 'anthropic' ? 'anthropic' : 'openai';
}

export function aiReady(): boolean {
  return aiProvider() === 'anthropic' ? !!process.env.ANTHROPIC_API_KEY : !!process.env.OPENAI_API_KEY;
}

export function aiModel(): string {
  return aiProvider() === 'anthropic'
    ? process.env.ANTHROPIC_MODEL || ''
    : process.env.OPENAI_AGENT_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini';
}

/** Gọi mô hình và trả về text. json=true: yêu cầu đầu ra JSON (OpenAI ép bằng response_format). */
export async function aiChat(o: {
  system: string; user: string; temperature?: number; maxTokens?: number; json?: boolean;
}): Promise<string> {
  const temperature = o.temperature ?? 0;
  const maxTokens = o.maxTokens ?? 700;

  if (aiProvider() === 'anthropic') {
    const model = process.env.ANTHROPIC_MODEL;
    if (!model) throw new Error('Thiếu ANTHROPIC_MODEL');
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY || '',
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model, max_tokens: maxTokens, temperature, system: o.system,
        messages: [{ role: 'user', content: o.user }],
      }),
    });
    if (!r.ok) throw new Error(`Claude HTTP ${r.status}: ${(await r.text()).slice(0, 300)}`);
    const data = (await r.json()) as { content?: { type: string; text?: string }[] };
    return (data.content || []).filter((b) => b.type === 'text').map((b) => b.text || '').join('').trim();
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const res = await openai.chat.completions.create({
    model: aiModel(),
    temperature,
    max_tokens: maxTokens,
    ...(o.json ? { response_format: { type: 'json_object' as const } } : {}),
    messages: [
      { role: 'system', content: o.system },
      { role: 'user', content: o.user },
    ],
  });
  return res.choices[0]?.message?.content?.trim() || '';
}
