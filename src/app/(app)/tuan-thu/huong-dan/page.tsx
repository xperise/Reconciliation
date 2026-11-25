import Link from 'next/link';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { PageHeader } from '@/components/PageHeader';
import { nguoiTT } from '@/lib/tuan-thu/db';

export const dynamic = 'force-dynamic';

type Buoc = { ten: string; vai: string; lam: string; kq: string; link: string; xong: boolean };

export default async function Page() {
  await nguoiTT();
  const sb = supabaseAdmin();
  const { data: hdDs } = await sb.from('tt_hop_dong').select('id, group_id').eq('ma_khach', 'VCB').order('created_at').limit(1);
  const hd = (hdDs ?? [])[0] as any;
  const hdId = hd?.id ?? '00000000-0000-0000-0000-000000000000';
  const [{ data: tv }, { data: qt }, { data: runs }, { data: sd }, { data: sk }, { data: ai }, { data: chan }] = await Promise.all([
    sb.from('tt_thanh_vien').select('phong_ban'),
    sb.from('tt_quy_tac').select('phong_ban, chot').eq('hop_dong_id', hdId),
    sb.from('tt_lan_chay').select('*').eq('hop_dong_id', hdId),
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
      { ten: 'Chạy SQL 38 → 46', vai: 'Admin', lam: 'Supabase → SQL Editor: chạy lần lượt các file 38 đến 46 trong supabase/migrations (38_tuan_thu … 46_tuan_thu_mau_bang_ke).', kq: 'Có hợp đồng VCB, 32 quy tắc, skill v1 cho 4 phòng.', link: '/tuan-thu/quy-tac', xong: !!hd && (sk ?? []).length >= 4 },
      { ten: 'Nhập API key AI', vai: 'Admin', lam: 'Vercel → Settings → Environment Variables. Dùng OpenAI: AI_PROVIDER=openai, OPENAI_API_KEY, OPENAI_AGENT_MODEL. Dùng Claude: AI_PROVIDER=anthropic, ANTHROPIC_API_KEY (tùy chọn ANTHROPIC_MODEL). Rồi Redeploy và bấm Kiểm tra kết nối AI ở trang Agent.', kq: 'Nút agent AI trả lời được.', link: '/tuan-thu/agent', xong: (ai ?? []).length > 0 },
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
    { phan: 'C0 · Mẫu bảng kê riêng của khách', buoc: [
      { ten: 'Học mẫu từ một bảng kê đã gửi khách', vai: 'Kế toán', lam: 'Hợp đồng, quy tắc & mẫu → chọn khách → mục Mẫu bảng kê: upload một bảng kê khách đã nhận (hoặc đính kèm cho agent và nhắn "ghi nhớ mẫu bảng kê của khách này"). Xem bảng ghép cột mẫu ↔ cột raw, sửa chỗ chưa đúng, bấm Duyệt mẫu.', kq: 'Lần chạy từ raw tiếp theo của khách ra đúng mẫu (đầu trang, cột, dòng tổng, chữ ký, danh sách phòng ban).', link: '/tuan-thu/quy-tac', xong: false },
    ] },
    { phan: 'C2 · Kiểm tra bảng kê kế toán đã format', buoc: [
      { ten: 'Upload bảng kê đã format', vai: 'Kế toán', lam: 'Lần chạy bảng kê → chọn "Bảng kê kế toán đã format", chọn file bảng kê (raw để đối chiếu: không bắt buộc). App kiểm tra đầu trang, tài khoản, chiết khấu, phí, số học, dòng tổng, sheet tổng hợp, định mức, kỳ; tạo bản đã sửa theo quy tắc giữ nguyên mẫu file.', kq: 'Có cảnh báo, bảng các ô bản đã sửa thay đổi, và 2 file để tải: bản kế toán upload và bản đã sửa.', link: '/tuan-thu', xong: R.some((r) => r.che_do === 'da_format') },
      { ten: 'Chọn bản gửi khách, duyệt', vai: 'Kế toán → CEO', lam: 'Kế toán chọn gửi bản đã sửa theo quy tắc hoặc bản tự format (chọn bản tự format thì các cảnh báo phải có giải trình), rồi duyệt; CEO duyệt là app gửi đúng bản đã chọn.', kq: 'Thư gửi khách đính kèm đúng bản đã chọn.', link: '/tuan-thu', xong: R.some((r) => r.che_do === 'da_format' && r.buoc === 'da_gui') },
    ] },
    { phan: 'D · Sửa đổi quy tắc: VCB nhận bảng kê 2 đợt', buoc: [
      { ten: 'Demand đề xuất sửa DM-01', vai: 'Demand', lam: 'Sửa đổi quy tắc: chọn DM-01, nội dung "Chia 2 đợt theo ngày giao dịch", tham số Kỳ bảng kê: chia 2 đợt, ngày cắt 15, hiệu lực từ 2026-10, căn cứ là email/phụ lục VCB.', kq: 'SĐ ở trạng thái Chờ duyệt.', link: '/tuan-thu/sua-doi', xong: !!dm01 },
      { ten: 'Ba head còn lại phân tích và đồng ý', vai: 'Kế toán, Supply, CEO', lam: 'Mỗi head bấm Agent AI phân tích tác động, đọc rồi Đồng ý hoặc Không đồng ý kèm lý do.', kq: 'Đủ 4/4: bộ quy tắc lên phiên bản mới (2 đợt).', link: '/tuan-thu/sua-doi', xong: dm01?.trang_thai === 'hieu_luc' },
    ] },
    { phan: 'E · Chạy lại T10/2026 theo 2 đợt', buoc: [
      { ten: 'Kế toán tạo đợt 1 và đợt 2', vai: 'Kế toán', lam: 'Tạo lần chạy Đợt 1 với raw 01–15/10 và Đợt 2 với raw 16–31/10.', kq: 'Đợt 1 1.518.452.016đ; đợt 2 1.139.174.759đ; cộng lại bằng cả tháng.', link: '/tuan-thu', xong: d1.length > 0 && d2.length > 0 },
      { ten: 'Duyệt và gửi cả hai đợt', vai: 'Kế toán, CEO', lam: 'Lặp lại phần C cho từng đợt: kế toán duyệt, CEO duyệt; Demand/Supply chỉ can thiệp khi cần.', kq: 'Cả hai đợt Đã gửi khách.', link: '/tuan-thu', xong: d1.some((r) => r.buoc === 'da_gui') && d2.some((r) => r.buoc === 'da_gui') },
    ] },
    { phan: 'F0 · Làm việc qua agent (như Cowork)', buoc: [
      { ten: 'Giao việc cho agent bằng tin nhắn', vai: 'Head bất kỳ', lam: 'Bấm Làm việc với agent (góc phải, có ở mọi trang). Ví dụ kế toán nhắn: "sửa mã cán bộ dòng 25 vé máy bay thành 1234, lý do nhập sai", "ghi giải trình cho các cảnh báo thiếu hóa đơn", "duyệt bước của tôi"; Demand nhắn "chặn bảng kê vì 12 phòng vượt định mức chưa có tờ trình"; CEO nhắn "duyệt và gửi". Agent đọc dữ liệu, chuẩn bị thẻ thao tác; bấm Thực hiện thì mới chạy.', kq: 'Thẻ chuyển Đã thực hiện; thao tác ghi vào nhật ký và lịch sử lần chạy.', link: '/tuan-thu', xong: false },
    ] },
    { phan: 'G · Thêm hợp đồng / khách mới', buoc: [
      { ten: 'Upload hợp đồng, agent đọc', vai: 'Bất kỳ head', lam: 'Hợp đồng & quy tắc → Thêm hợp đồng / khách mới: nhập mã khách, tên ở cột Tên công ty của raw, số HĐ, tháng áp dụng, nhóm Master Data; chọn PDF hợp đồng và phụ lục. Agent đọc ra tóm tắt điều khoản, tham số máy, điểm còn mở và quy tắc của 4 phòng.', kq: 'Hợp đồng ở trạng thái Chờ chốt với bộ quy tắc nháp.', link: '/tuan-thu/hop-dong/moi', xong: false },
      { ten: '4 head chốt, CEO kích hoạt', vai: 'Cả 4, CEO', lam: 'Mỗi head đọc và chốt quy tắc của phòng (hoặc nhắn agent: chốt các quy tắc <mã khách> của tôi); xem các điểm còn mở; sửa tham số bản nháp nếu agent đọc chưa đúng. CEO bấm Kích hoạt hợp đồng.', kq: 'Hợp đồng Đang hiệu lực, xuất hiện trong danh sách khi tạo lần chạy.', link: '/tuan-thu/quy-tac', xong: false },
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
