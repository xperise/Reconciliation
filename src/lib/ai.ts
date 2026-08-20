import OpenAI from 'openai';

/** Bốn action chuẩn theo sheet "3. Quy định chung SLA". */
export type ActionKhach = 'dong_y' | 'tu_choi' | 'trao_doi_them' | 'review';

export type Classification = {
  action: ActionKhach;
  pham_vi: string;      // toàn bộ / dòng-mục cụ thể
  tom_tat: string;
  do_tin_cay: number;   // 0..1
  nguon: 'ai' | 'tu_khoa';
};

const SYSTEM_PROMPT = `Bạn là trợ lý kế toán của xperise, phân loại email phản hồi của khách hàng doanh nghiệp về bảng kê đối soát dịch vụ.

Phân loại vào ĐÚNG MỘT trong bốn action:
- "dong_y": khách xác nhận bảng kê đúng, đồng ý chốt, không có yêu cầu sửa.
- "tu_choi": khách không đồng ý với bảng kê, phản đối số liệu, từ chối chấp nhận.
- "trao_doi_them": khách hỏi làm rõ, yêu cầu bổ sung thông tin, hoặc yêu cầu chỉnh sửa cụ thể.
- "review": khách mới xác nhận đã nhận/đang xem, chưa có ý kiến thực chất. Đây là trạng thái trung gian.

Quy tắc:
- Chỉ căn cứ vào nội dung khách viết mới nhất, bỏ qua phần trích dẫn email cũ.
- "pham_vi" ghi rõ khách nói về toàn bộ bảng kê hay chỉ một dòng/mục cụ thể. Nếu khách nêu mã booking, tên khách, số hóa đơn cụ thể thì liệt kê ra.
- "tom_tat" viết tiếng Việt, tối đa 2 câu, nêu đúng điều khách muốn.
- Nếu email mơ hồ, chọn "review" và để do_tin_cay thấp.

Chỉ trả về JSON thuần, không markdown, không giải thích:
{"action":"...","pham_vi":"...","tom_tat":"...","do_tin_cay":0.0}`;

/** Dự phòng khi không gọi được OpenAI — thà phân loại thô còn hơn chặn cả quy trình. */
function classifyByKeyword(text: string): Classification {
  const t = text.toLowerCase();
  const has = (...kws: string[]) => kws.some((k) => t.includes(k));

  if (has('không đồng ý', 'ko đồng ý', 'từ chối', 'phản đối', 'không chấp nhận')) {
    return { action: 'tu_choi', pham_vi: 'chưa xác định', tom_tat: 'Khách từ chối bảng kê.', do_tin_cay: 0.4, nguon: 'tu_khoa' };
  }
  if (has('điều chỉnh', 'chỉnh sửa', 'sửa lại', 'sai', 'thiếu', 'nhầm', 'kiểm tra lại', 'bổ sung')) {
    return { action: 'trao_doi_them', pham_vi: 'chưa xác định', tom_tat: 'Khách yêu cầu chỉnh sửa hoặc làm rõ.', do_tin_cay: 0.4, nguon: 'tu_khoa' };
  }
  if (has('xác nhận', 'đồng ý', 'ok bảng kê', 'chốt', 'không có ý kiến')) {
    return { action: 'dong_y', pham_vi: 'toàn bộ', tom_tat: 'Khách xác nhận đồng ý bảng kê.', do_tin_cay: 0.4, nguon: 'tu_khoa' };
  }
  return { action: 'review', pham_vi: 'chưa xác định', tom_tat: 'Khách đã phản hồi nhưng chưa rõ ý.', do_tin_cay: 0.2, nguon: 'tu_khoa' };
}

export async function classifyReply(emailBody: string): Promise<Classification> {
  const clean = emailBody
    .split(/\n\s*(?:On .+ wrote:|Vào .+ đã viết:|-{3,}\s*Original Message)/i)[0]
    .replace(/^>.*$/gm, '')
    .trim()
    .slice(0, 6000);

  if (!process.env.OPENAI_API_KEY) return classifyByKeyword(clean);

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const res = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: clean },
      ],
    });

    const raw = res.choices[0]?.message?.content ?? '{}';
    const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());

    const valid: ActionKhach[] = ['dong_y', 'tu_choi', 'trao_doi_them', 'review'];
    if (!valid.includes(parsed.action)) return classifyByKeyword(clean);

    return {
      action: parsed.action,
      pham_vi: String(parsed.pham_vi ?? 'chưa xác định').slice(0, 500),
      tom_tat: String(parsed.tom_tat ?? '').slice(0, 1000),
      do_tin_cay: Number(parsed.do_tin_cay ?? 0.5),
      nguon: 'ai',
    };
  } catch (err) {
    console.error('[ai] phân loại thất bại, chuyển sang từ khóa:', err);
    return classifyByKeyword(clean);
  }
}
