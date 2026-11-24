import Link from 'next/link';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { PageHeader } from '@/components/PageHeader';
import { fmtVnd, nhanThang, TEN_BUOC } from '@/lib/tuan-thu/db';
import { TaoLanChay } from './tao-lan-chay';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const sb = supabaseAdmin();
  const [{ data: hd }, { data: ds }] = await Promise.all([
    sb.from('tt_hop_dong').select('id, ma_khach, ten_khach, so_hop_dong').order('ma_khach'),
    sb.from('tt_lan_chay').select('id, thang, dot, buoc, vong, tong_hop, loi, created_at, phien_ban_quy_tac, tt_hop_dong(ma_khach)')
      .order('created_at', { ascending: false }).limit(100),
  ]);
  return (
    <>
      <PageHeader eyebrow="Tuân thủ bảng kê" title="Lần chạy bảng kê"
        description="Kế toán upload raw → app format theo mẫu khách và tự sửa theo bộ quy tắc hợp đồng (có ghi nhật ký) → kế toán xác nhận → Demand & Supply duyệt → CEO duyệt là app gửi bảng kê. Mỗi bước có đề xuất của agent và người duyệt." />
      <section className="card card-pad mb-5">
        <h2 className="card-title mb-3">Tạo lần chạy mới</h2>
        <TaoLanChay hopDong={(hd ?? []) as any} />
      </section>
      <div className="card overflow-hidden">
        <table className="tbl">
          <thead><tr><th>Khách</th><th>Kỳ</th><th>Quy tắc</th><th>Bước</th><th className="text-right">Tổng gửi khách</th><th>Tạo lúc</th><th></th></tr></thead>
          <tbody>
            {(ds ?? []).length === 0 && <tr><td colSpan={7} className="empty">Chưa có lần chạy nào.</td></tr>}
            {(ds ?? []).map((r: any) => (
              <tr key={r.id}>
                <td className="font-semibold">{r.tt_hop_dong?.ma_khach}</td>
                <td>{nhanThang(r.thang, r.dot)}</td>
                <td>v{r.phien_ban_quy_tac}</td>
                <td>{r.loi ? <span className="pill pill-critical">Lỗi xử lý</span>
                  : <span className={`pill ${r.buoc === 'da_gui' ? 'pill-stable' : 'pill-watch'}`}>{TEN_BUOC[r.buoc] ?? r.buoc}</span>}
                  {r.vong > 1 && <span className="text-[11px] text-[var(--ink-3)] ml-1">vòng {r.vong}</span>}</td>
                <td className="text-right mono">{fmtVnd(r.tong_hop?.tong_cong)}</td>
                <td className="text-xs">{new Date(r.created_at).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}</td>
                <td className="text-right"><Link className="btn btn-sm" href={`/tuan-thu/chay/${r.id}`}>Mở</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
