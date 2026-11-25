import { goiClaudeCongCu } from './agent';
import { CauTrucMau, COT_RAW } from './mau-bang-ke';
import { LoaiDichVu } from './types';

/**
 * Agent gợi ý ghép các cột mẫu chưa tự ghép được với cột raw (dựa trên tên cột và giá trị mẫu).
 * Kế toán vẫn xem và sửa được trước khi duyệt mẫu. Lỗi / thiếu API key thì bỏ qua, giữ ghép tự động.
 */
export async function goiYGhepCot(ct: CauTrucMau): Promise<{ ct: CauTrucMau; daGoiY: number }> {
  const can = ct.sheets.filter((s) => s.loai !== 'tong_hop').flatMap((s) => s.cot.filter((c) => !c.nguon).map((c) => ({ sheet: s.ten, loai: s.loai as LoaiDichVu, so: c.so, ten: c.ten, mau: c.mau ?? [] })));
  if (!can.length || !process.env.ANTHROPIC_API_KEY) return { ct, daGoiY: 0 };
  try {
    const tool = { name: 'ghep_cot', description: 'Ghép cột của mẫu bảng kê với cột raw.', input_schema: { type: 'object', properties: { ghep: { type: 'array', items: { type: 'object',
      properties: { sheet: { type: 'string' }, so: { type: 'integer' }, nguon: { type: 'string', description: 'tên cột raw đúng nguyên văn, hoặc "" nếu cột này không lấy từ raw (để trống / khách tự điền)' } }, required: ['sheet', 'so', 'nguon'] } } }, required: ['ghep'] } };
    const d = await goiClaudeCongCu('Bạn ghép cột bảng kê của khách với cột của file raw hệ thống. Chỉ ghép khi chắc chắn cùng ý nghĩa; không chắc thì để "".',
      [{ role: 'user', content: `Cột raw khách sạn: ${COT_RAW.khach_san.join(' | ')}\nCột raw vé máy bay: ${COT_RAW.ve_may_bay.join(' | ')}\n\nCác cột mẫu chưa ghép:\n${can.map((c) => `- sheet "${c.sheet}" (${c.loai}), cột số ${c.so}: "${c.ten}" — giá trị mẫu: ${c.mau.join(' ; ') || '(trống)'}`).join('\n')}\n\nGọi ghep_cot.` }],
      [tool], 2000, 'ghep_cot');
    const u = (d.content ?? []).find((b: any) => b.type === 'tool_use');
    let dem = 0;
    for (const g of (u?.input?.ghep ?? []) as any[]) {
      const sh = ct.sheets.find((s) => s.ten === g.sheet); const c = sh?.cot.find((x) => x.so === g.so);
      if (!sh || !c || c.nguon || !g.nguon) continue;
      if (COT_RAW[sh.loai as LoaiDichVu]?.includes(g.nguon)) { c.nguon = g.nguon; dem++; }
    }
    return { ct, daGoiY: dem };
  } catch { return { ct, daGoiY: 0 }; }
}
