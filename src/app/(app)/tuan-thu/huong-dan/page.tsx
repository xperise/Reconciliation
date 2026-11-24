import Link from 'next/link';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { PageHeader } from '@/components/PageHeader';
import { nguoiTT } from '@/lib/tuan-thu/db';

export const dynamic = 'force-dynamic';

type Buoc = { ten: string; vai: string; lam: string; kq: string; link: string; xong: boolean };

export default async function Page() {
  await nguoiTT();
  const sb = supabaseAdmin();
  const { data: hd } = await sb.from('tt_hop_dong').select('id, group_id').eq('ma_khach', 'VCB').maybeSingle();
  const hdId = hd?.id ?? '00000000-0000-0000-0000-000000000000';
  const [{ data: tv }, { data: qt }, { data: runs }, { data: sd }, { data: sk }, { data: ai }, { data: chan }] = await Promise.all([
    sb.from('tt_thanh_vien').select('phong_ban'),
    sb.from('tt_quy_tac').select('phong_ban, chot').eq('hop_dong_id', hdId),
    sb.from('tt_lan_chay').select('id, dot, buoc, vong, loi').eq('hop_dong_id', hdId),
    sb.from('tt_sua_doi').select('ma_quy_tac, trang_thai').eq('hop_dong_id', hdId),
    sb.from('tt_skill').select('phong_ban, phien_ban, ly_do'),
    sb.from('tt_ai_ket_qua').select('loai').limit(200),
    sb.from('tt_chan').select('go_luc').limit(200),
  ]);
  const coTv = (p: string) => (tv ?? []).some((x: any) => x.phong_ban === p);
  const chot = (p: string) => { const ds = (qt ?? []).filter((q: any) => q.phong_ban === p); return ds.length > 0 && ds.every((q: any) => q.chot === 'dong_y'); };
  const R = (runs ?? []) as any[];
  const thang = R.filter((r) => !r.dot), d1 = R.filter((r) => r.dot === 1), d2 = R.filter((r) => r.dot === 2);
  const dm01 = (sd ?? []).find((x: any) => x.ma_quy_tac === 'DM-01');
  const P: { phan: string; buoc: Buoc[] }[] = [
    { phan: 'A · Cài đặt (admin, làm một lần)', buoc: [
      { ten: 'Chạy SQL 38, 39, 40', vai: 'Admin', lam: 'Supabase → SQL Editor: chạy lần lượt supabase/migrations/38_tuan_thu.sql, 39_tuan_thu_agent.sql, 40_tuan_thu_chan.sql.', kq: 'Có hợp đồng VCB, 32 quy tắc, skill v1 cho 4 phòng.', link: '/tuan-thu/quy-tac', xong: !!hd && (sk ?? []).length >= 4 },
      { ten: 'Nhập Claude API key', vai: 'Admin', lam: 'Vercel → Settings → Environment Variables: thêm ANTHROPIC_API_KEY (tùy chọn ANTHROPIC_MODEL), rồi Redeploy.', kq: 'Nút agent AI trả lời được.', link: '/tuan-thu/agent', xong: (ai ?? []).length > 0 },
      { ten: 'Gán phòng ban cho 4 head', vai: 'Admin', lam: 'Mục Thành viên: gán Kế toán, Demand, Supply, CEO.', kq: 'Mỗi head thấy tab Tuân thủ và chỉ duyệt được bước của phòng mình.', link: '/tuan-thu/thanh-vien', xong: ['ke_toan', 'demand', 'supply', 'ceo'].every(coTv) },
      { ten: 'Gắn nhóm Master Data cho hợp đồng VCB', vai: 'Admin', lam: 'Hợp đồng & quy tắc: chọn nhóm Master Data (email đầu mối, CC). Khi thử nghiệm, gắn tạm nhóm có email nội bộ vì CEO duyệt là app gửi thư thật.', kq: 'Hiện email đầu mối dưới tên hợp đồng.', link: '/tuan-thu/quy-tac', xong: !!hd?.group_id },
    ] },
    { phan: 'B · Chốt bộ quy tắc từ hợp đồng gốc', buoc: ['ke_toan', 'demand', 'supply', 'ceo'].map((p) => ({
      ten: `${({ ke_toan: 'Kế toán', demand: 'Demand', supply: 'Supply', ceo: 'CEO' } as any)[p]} chốt quy tắc của phòng`, vai: ({ ke_toan: 'Kế toán', demand: 'Demand', supply: 'Supply', ceo: 'CEO' } as any)[p],
      lam: 'Đọc từng quy tắc, đối chiếu cột Căn cứ với hợp đồng; bấm Đồng ý, hoặc Cần sửa / Đề xuất sửa. Có thể hỏi agent của phòng ở trang Agent.', kq: 'Mọi quy tắc của phòng ở trạng thái Đã đồng ý.', link: '/tuan-thu/quy-tac', xong: chot(p) })) },
    { phan: 'C · Chạy bảng kê T10/2026 theo hợp đồng gốc (1 kỳ/tháng)', buoc: [
      { ten: 'Kế toán upload raw', vai: 'Kế toán', lam: 'Lần chạy bảng kê: chọn VCB, tháng 10/2026, Đợt = Cả tháng, chọn 2 file raw (khách sạn, vé), Upload & xử lý.', kq: 'Tổng 2.657.626.775đ; 265 ô app tự sửa; 15 cảnh báo.', link: '/tuan-thu', xong: thang.length > 0 },
      { ten: 'Kế toán xác nhận ô app tự sửa và giải trình', vai: 'Kế toán', lam: 'Xác nhận app sửa đúng (hoặc tự sửa raw rồi tải lại). Điền giải trình cho cảnh báo; có thể bấm Nhờ agent Kế toán gợi ý giải trình rồi sửa lại. Bấm Agent AI rà soát trước khi duyệt.', kq: 'Agent đề xuất DUYỆT; bước chuyển sang Chờ CEO, Demand/Supply/CEO nhận thông báo.', link: '/tuan-thu', xong: thang.some((r) => r.buoc !== 'cho_ke_toan') },
      { ten: 'Demand và Supply nhận cảnh báo, thử chặn rồi gỡ', vai: 'Demand, Supply', lam: 'Không cần duyệt. Mỗi head nhận chuông và email cảnh báo thuộc scope, mở lần chạy, bấm Agent AI rà soát. Thử Chặn bảng kê kèm lý do (CEO sẽ không duyệt được), rồi Gỡ chặn kèm ghi chú đã xử lý.', kq: 'Lịch sử chặn và gỡ chặn hiện trong khung kiểm soát và ở màn hình CEO.', link: '/tuan-thu', xong: ((chan ?? []) as any[]).some((c) => c.go_luc) },
      { ten: 'CEO duyệt và gửi', vai: 'CEO', lam: 'Xem thay đổi so với raw, ngoại lệ kèm giải trình, thư sẽ gửi; bấm Agent AI rà soát; Duyệt & gửi.', kq: 'Trạng thái Đã gửi khách; thư đi từ cs@uts.network.', link: '/tuan-thu', xong: thang.some((r) => r.buoc === 'da_gui') },
    ] },
    { phan: 'D · Sửa đổi quy tắc: VCB nhận bảng kê 2 đợt', buoc: [
      { ten: 'Demand đề xuất sửa DM-01', vai: 'Demand', lam: 'Sửa đổi quy tắc: chọn DM-01, nội dung "Chia 2 đợt theo ngày giao dịch", tham số Kỳ bảng kê: chia 2 đợt, ngày cắt 15, hiệu lực từ 2026-10, căn cứ là email/phụ lục VCB.', kq: 'SĐ ở trạng thái Chờ duyệt.', link: '/tuan-thu/sua-doi', xong: !!dm01 },
      { ten: 'Ba head còn lại phân tích và đồng ý', vai: 'Kế toán, Supply, CEO', lam: 'Mỗi head bấm Agent AI phân tích tác động, đọc rồi Đồng ý hoặc Không đồng ý kèm lý do.', kq: 'Đủ 4/4: bộ quy tắc lên phiên bản mới (2 đợt).', link: '/tuan-thu/sua-doi', xong: dm01?.trang_thai === 'hieu_luc' },
    ] },
    { phan: 'E · Chạy lại T10/2026 theo 2 đợt', buoc: [
      { ten: 'Kế toán tạo đợt 1 và đợt 2', vai: 'Kế toán', lam: 'Tạo lần chạy Đợt 1 với raw 01–15/10 và Đợt 2 với raw 16–31/10.', kq: 'Đợt 1 1.518.452.016đ; đợt 2 1.139.174.759đ; cộng lại bằng cả tháng.', link: '/tuan-thu', xong: d1.length > 0 && d2.length > 0 },
      { ten: 'Duyệt và gửi cả hai đợt', vai: 'Kế toán, CEO', lam: 'Lặp lại phần C cho từng đợt: kế toán duyệt, CEO duyệt; Demand/Supply chỉ can thiệp khi cần.', kq: 'Cả hai đợt Đã gửi khách.', link: '/tuan-thu', xong: d1.some((r) => r.buoc === 'da_gui') && d2.some((r) => r.buoc === 'da_gui') },
    ] },
    { phan: 'F · Trả về, tải lại raw và học từ quyết định', buoc: [
      { ten: 'Trả về và tải lại raw', vai: 'Demand → Kế toán', lam: 'Ở một lần chạy chưa gửi, Demand bấm Trả về kế toán kèm lý do; kế toán tải lại raw đã sửa.', kq: 'Lần chạy sang vòng 2, lịch sử giữ đủ.', link: '/tuan-thu', xong: R.some((r) => r.vong > 1) },
      { ten: 'Nhận gợi ý bổ sung skill', vai: 'Head bất kỳ', lam: 'Gợi ý được tạo khi Demand/Supply gỡ chặn kèm ghi chú, hoặc khi kế toán/CEO duyệt dù agent AI rà soát đề xuất trả về (có ghi ý kiến). Vào Agent của tôi, bấm Thêm vào skill.', kq: 'Skill lên phiên bản mới với lý do Học từ quyết định.', link: '/tuan-thu/agent', xong: (sk ?? []).some((x: any) => /^Học từ/.test(x.ly_do ?? '')) },
    ] },
  ];
  const tat = P.flatMap((p) => p.buoc), xong = tat.filter((b) => b.xong).length;
  let n = 0;
  return (
    <>
      <PageHeader eyebrow="Tuân thủ bảng kê" title="Hướng dẫn từ A đến Z · flow VCB"
        description="Đi lần lượt từng bước. Bước tự đánh dấu xong khi dữ liệu trong hệ thống đạt điều kiện. Muốn thử không rủi ro (không gửi thư thật) thì dùng bản prototype: https://claude.ai/artifact/34xGFpJ7PGCdpfjKFUvziJ" />
      <div className="card card-pad mb-4">
        <div className="flex justify-between text-[13px]"><b>Tiến độ: {xong}/{tat.length} bước</b><span>{Math.round((xong / tat.length) * 100)}%</span></div>
        <div className="prog-track mt-2" style={{ height: 8, borderRadius: 999, background: 'var(--surface-2)', overflow: 'hidden' }}>
          <div style={{ width: `${(xong / tat.length) * 100}%`, height: '100%', background: 'var(--accent)' }} /></div>
      </div>
      {P.map((p) => (
        <section key={p.phan} className="card overflow-hidden mb-4">
          <div className="card-hd px-4 py-2 font-semibold">{p.phan}</div>
          <table className="tbl"><thead><tr><th style={{ width: 36 }}>#</th><th>Bước</th><th>Vai</th><th>Làm gì</th><th>Kết quả mong đợi</th><th></th></tr></thead>
            <tbody>{p.buoc.map((b) => { n++; return (
              <tr key={n}><td>{n}</td><td className="font-semibold">{b.ten}</td><td className="text-[12px]">{b.vai}</td><td className="text-[12px]">{b.lam}</td><td className="text-[12px]">{b.kq}</td>
                <td>{b.xong ? <span className="pill pill-stable">Đã xong</span> : <Link className="btn btn-sm btn-primary" href={b.link}>Đi tới</Link>}</td></tr>); })}</tbody></table>
        </section>
      ))}
    </>
  );
}
