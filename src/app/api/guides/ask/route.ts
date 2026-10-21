import { NextResponse } from "next/server";
import OpenAI from "openai";
import { guideUser, isJourney, loadLibrary } from "@/lib/guide/server";
import { buildIndex, search } from "@/lib/guide/search";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SYSTEM = `Bạn là trợ lý của Trung tâm hướng dẫn XPAY (Xperise), trả lời cho nhân viên Vận hành, Tổng đài, Sales và CS.
Chỉ dựa vào các ĐOẠN TÀI LIỆU được cung cấp. Không bịa thêm menu, số liệu, chính sách.
- Trả lời tiếng Việt, ngắn gọn, đi thẳng vào việc cần làm: nêu nguyên nhân (nếu là lỗi) rồi các bước xử lý theo thứ tự, ghi rõ ai làm và làm trên hệ thống nào.
- Dùng gạch đầu dòng hoặc danh sách số cho các bước. Đường dẫn menu để trong dấu \`…\`.
- Sau mỗi ý, ghi nguồn bằng [số] tương ứng đoạn tài liệu, ví dụ [2]. Chỉ dẫn những đoạn thật sự dùng.
- Nếu tài liệu không đủ để trả lời, nói rõ "Hướng dẫn hiện chưa có nội dung này" và gợi ý mục gần nhất.`;

/** POST { q } → { answer, sources } — tìm đoạn liên quan rồi nhờ AI tóm câu trả lời có dẫn nguồn */
export async function POST(req: Request) {
  const g = await guideUser();
  if (!g || !g.view) return NextResponse.json({ error: "Không có quyền" }, { status: 403 });
  const { q } = (await req.json()) as { q?: string };
  const query = String(q || "").trim().slice(0, 300);
  if (query.length < 3) return NextResponse.json({ error: "Câu hỏi quá ngắn" }, { status: 400 });
  if (!process.env.OPENAI_API_KEY) return NextResponse.json({ error: "Chưa cấu hình OPENAI_API_KEY trên Vercel nên chưa hỏi trợ lý được — dùng kết quả tìm kiếm bên dưới." }, { status: 503 });

  const { guides } = await loadLibrary(g.edit);
  const J = guides.find(isJourney);
  const lib = Object.fromEntries(guides.filter((x) => !isJourney(x)).map((x) => [x.slug, x]));
  const idx = buildIndex(lib, J?.extras?.journey, J?.extras?.journey?.sources);
  const hits = search(idx, query, 8);
  if (!hits.length) return NextResponse.json({ answer: "Hướng dẫn hiện chưa có nội dung khớp câu hỏi này. Thử diễn đạt khác, hoặc xem mục Sự cố thường gặp.", sources: [] });

  const docs = hits.map((h, i) => `[${i + 1}] ${h.c.guide} › ${h.c.title}${h.c.head ? " › " + h.c.head : ""}${h.c.at ? ` (Chặng ${h.c.at.k + 1}: ${h.c.at.stage})` : ""}\n${h.c.text.slice(0, 1400)}`).join("\n\n");
  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const r = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini", temperature: 0.1, max_tokens: 700,
      messages: [{ role: "system", content: SYSTEM }, { role: "user", content: `CÂU HỎI: ${query}\n\nĐOẠN TÀI LIỆU:\n${docs}` }],
    });
    const answer = r.choices[0]?.message?.content?.trim() || "";
    const sources = hits.map((h, i) => ({ n: i + 1, g: h.c.g, s: h.c.s, title: h.c.title, head: h.c.head, guide: h.c.guide, at: h.c.at || null, terms: h.terms }));
    return NextResponse.json({ answer, sources, journey: J?.slug || null }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: "Trợ lý đang bận: " + (e instanceof Error ? e.message : String(e)) }, { status: 502 });
  }
}
