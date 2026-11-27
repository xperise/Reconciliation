import Link from 'next/link';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { PageHeader } from '@/components/PageHeader';
import { nguoiTT } from '@/lib/tuan-thu/db';
import { toChucHienTai } from '@/lib/tuan-thu/to-chuc-server';

export const dynamic = 'force-dynamic';

type Buoc = { ten: string; vai: string; lam: string; kq: string; link: string; xong: boolean; ghiChu?: string };

/**
 * Hướng dẫn A → Z cho một khách: từ hợp đồng gốc đến bảng kê đã rà soát, dừng trước khi gửi.
 * Bước tự đánh dấu xong khi dữ liệu trong hệ thống đạt điều kiện; bước làm ngoài hệ thống luôn để trống.
 */
export default async function Page() {
  await nguoiTT();
  const org = await toChucHienTai();
  const sb = supabaseAdmin();
  const { data: hdDs } = await sb.from('tt_hop_dong').select('id, ma_khach, trang_thai')
    .eq('org_id', org).order('created_at', { ascending: false }).limit(1);
  const hd = (hdDs ?? [])[0] as any;
  const hdId = hd?.id ?? '00000000-0000-0000-0000-000000000000';
  const [{ data: tv }, { data: qt }, { data: runs }, { data: mau }] = await Promise.all([
    sb.from('tt_thanh_vien').select('phong_ban').eq('org_id', org),
    sb.from('tt_quy_tac').select('phong_ban, chot').eq('org_id', org).eq('hop_dong_id', hdId),
    sb.from('tt_lan_chay').select('buoc, che_do, vong, dot, thang').eq('org_id', org).eq('hop_dong_id', hdId),
    sb.from('tt_mau_bang_ke').select('id').eq('org_id', org).eq('ma_khach', hd?.ma_khach ?? '').eq('trang_thai', 'hieu_luc'),
  ]);
  const R = (runs ?? []) as any[];
  const phongCoQuyTac = [...new Set((qt ?? []).map((q: any) => q.phong_ban))];
  const phongDaChot = phongCoQuyTac.filter((p) => (qt ?? []).filter((q: any) => q.phong_ban === p).every((q: any) => q.chot === 'dong_y'));
  const daChotHet = phongCoQuyTac.length > 0 && phongDaChot.length === phongCoQuyTac.length;
  const coTv = (tv ?? []).length > 0;

  const P: { phan: string; buoc: Buoc[] }[] = [
    { phan: 'A · Chuẩn bị (một lần cho mỗi tổ chức)', buoc: [
      { ten: 'Gán người vào Tuân thủ', vai: 'Admin', lam: 'Thành viên: gán phòng ban cho kế toán, các head và CEO. Mời người qua email nếu họ chưa có trong danh sách (họ cần có tài khoản ứng dụng và đăng nhập đúng email được mời).', kq: 'Mỗi người làm việc đã có phòng ban và thấy được phần Tuân thủ.', link: '/tuan-thu/thanh-vien', xong: coTv },
    ] },
    { phan: 'B · Lấy hợp đồng và tạo khách', buoc: [
      { ten: 'Tải hợp đồng khách từ admin.uts.network', vai: 'Kế toán', lam: 'Mở admin.uts.network, tìm khách, tải về hợp đồng PDF và đầy đủ phụ lục đang hiệu lực. Kiểm tra số hợp đồng và ngày áp dụng trước khi tải lên.', kq: 'Có sẵn file PDF hợp đồng và các phụ lục trên máy.', link: 'https://admin.uts.network', xong: false, ghiChu: 'Làm ngoài hệ thống Tuân thủ.' },
      { ten: 'Tạo hợp đồng khách mới và upload PDF', vai: 'Kế toán', lam: 'Hợp đồng & quy tắc → Thêm hợp đồng / khách mới: nhập mã khách, tên công ty, số hợp đồng, tháng áp dụng, nhóm Master Data; chọn file PDF hợp đồng và các phụ lục. Agent đọc ngay và tạo bộ quy tắc nháp.', kq: 'Hợp đồng ở trạng thái đang chốt, có bộ quy tắc nháp theo từng phòng.', link: '/tuan-thu/hop-dong/moi', xong: !!hd },
      { ten: 'Upload mẫu bảng kê của khách', vai: 'Kế toán', lam: 'Hợp đồng & quy tắc → chọn khách → Mẫu bảng kê: upload file bảng kê mẫu khách đã nhận trước đó. Kiểm bảng ghép cột mẫu với cột raw, sửa chỗ chưa đúng, rồi bấm Duyệt mẫu.', kq: 'Mẫu bảng kê của khách đang hiệu lực; lần chạy sau sẽ ra đúng mẫu (đầu trang, cột, dòng tổng, chữ ký).', link: '/tuan-thu/quy-tac', xong: (mau ?? []).length > 0 },
    ] },
    { phan: 'C · Rà soát hợp đồng và quy tắc', buoc: [
      { ten: 'Xem agent đọc hợp đồng', vai: 'Kế toán, head', lam: 'Mở hợp đồng: đọc tóm tắt điều khoản, tham số máy (chiết khấu, phí, kỳ, định mức), và các điểm còn mở agent nêu. Nếu agent đọc sai, sửa tham số bản nháp.', kq: 'Tóm tắt và tham số khớp với hợp đồng gốc; điểm còn mở được ghi lại.', link: '/tuan-thu/quy-tac', xong: false, ghiChu: 'Cần người đọc đối chiếu; app không tự xác nhận.' },
      { ten: 'Rà quy tắc của từng phòng với hợp đồng', vai: 'Kế toán, Demand, Supply, CEO', lam: 'Mỗi phòng đọc quy tắc của mình, đối chiếu cột Căn cứ với điều khoản trong hợp đồng. Có thể hỏi agent của phòng: "quy tắc này có đúng theo hợp đồng không?". Sai thì bấm Cần sửa; đúng thì Đồng ý.', kq: 'Mọi quy tắc của mọi phòng ở trạng thái Đồng ý.', link: '/tuan-thu/quy-tac', xong: daChotHet },
      { ten: 'Kích hoạt hợp đồng', vai: 'CEO hoặc người được cấp quyền kích hoạt', lam: 'Khi các điểm còn mở đã quyết và quy tắc đã chốt, bấm Kích hoạt hợp đồng.', kq: 'Hợp đồng Đang hiệu lực; xuất hiện khi tạo lần chạy.', link: '/tuan-thu/quy-tac', xong: hd?.trang_thai === 'hieu_luc' },
    ] },
    { phan: 'D · Lấy bảng kê hotel và flight, đưa vào app', buoc: [
      { ten: 'Tải bảng kê hotel và flight từ Beautiful', vai: 'Kế toán', lam: 'Mở Beautiful, xuất bảng kê khách sạn (hotel) và vé máy bay (flight) đúng kỳ của khách. Kiểm tra đủ hai file và đúng tháng.', kq: 'Có hai file .xlsx: hotel và flight.', link: '/tuan-thu', xong: false, ghiChu: 'Làm ngoài hệ thống Tuân thủ, mở Beautiful bằng đường dẫn nội bộ của công ty.' },
      { ten: 'Tạo lần chạy và upload hai file', vai: 'Kế toán', lam: 'Lần chạy bảng kê → chọn khách, tháng, đợt (cả tháng hoặc đợt 1, 2); chọn hai file raw (hotel, flight); bấm Upload & xử lý.', kq: 'Lần chạy ở trạng thái chờ kế toán, có tổng tiền và cảnh báo.', link: '/tuan-thu', xong: R.length > 0 },
      { ten: 'Rà soát kết quả app tạo ra', vai: 'Kế toán', lam: 'Xem các ô app tự sửa theo quy tắc, các cảnh báo, và giải trình cần điền. Bấm Agent AI rà soát để agent đối chiếu bảng kê với quy tắc. Xác nhận ô đúng; sửa raw nếu cần rồi tải lại.', kq: 'Không còn cảnh báo chưa giải trình; agent nêu các điểm cần người xem.', link: '/tuan-thu', xong: R.some((r) => r.buoc !== 'cho_ke_toan') },
    ] },
    { phan: 'E · Rà soát bảng kê với mẫu khách và điều khoản', buoc: [
      { ten: 'Đối chiếu với mẫu bảng kê của khách', vai: 'Kế toán', lam: 'Mở bảng kê đã format (hoặc bản app tạo): so đầu trang, tên cột, thứ tự cột, dòng tổng, chữ ký, danh sách phòng ban với file mẫu khách. Hỏi agent: "bảng kê này đã đúng mẫu khách chưa?".', kq: 'Bảng kê đúng mẫu; chỗ khác mẫu đã được ghi và sửa.', link: '/tuan-thu', xong: false },
      { ten: 'Đối chiếu với điều khoản hợp đồng', vai: 'Kế toán, head', lam: 'Kiểm chiết khấu, phí dịch vụ, định mức, kỳ và tài khoản nhận tiền trên bảng kê với điều khoản hợp đồng. Hỏi agent: "các số này có đúng điều khoản không?" rồi tự kiểm lại các con số chính.', kq: 'Các con số khớp điều khoản; sai lệch có giải trình.', link: '/tuan-thu', xong: false },
    ] },
    { phan: 'F · Dừng trước khi gửi', buoc: [
      { ten: 'Dừng lại, không bấm gửi', vai: 'Kế toán', lam: 'Sau khi rà soát xong, dừng ở đây. Không bấm Duyệt để chuyển CEO và không bấm Gửi khách. Ghi lại ở ghi chú lần chạy: đã kiểm gì, còn điểm gì cần CEO xem.', kq: 'Lần chạy ở trạng thái chờ kế toán hoặc chờ CEO, chưa gửi; có ghi chú rà soát.', link: '/tuan-thu', xong: false, ghiChu: 'Bước gửi sẽ làm khi được duyệt riêng.' },
    ] },
  ];
  const tat = P.flatMap((p) => p.buoc), xong = tat.filter((b) => b.xong).length;
  let n = 0;
  return (
    <>
      <PageHeader eyebrow="Tuân thủ bảng kê" title="Hướng dẫn từ A đến Z"
        description="Từ hợp đồng gốc đến bảng kê đã rà soát, dừng trước khi gửi. Bước tự đánh dấu xong khi dữ liệu trong hệ thống đạt điều kiện; bước làm ngoài hệ thống luôn để trống." />
      <div className="card card-pad mb-4">
        <div className="flex justify-between text-[13px]"><b>Tiến độ: {xong}/{tat.length} bước đo được</b><span>{Math.round((xong / tat.length) * 100)}%</span></div>
        <div className="prog-track mt-2" style={{ height: 8, borderRadius: 999, background: 'var(--surface-2)', overflow: 'hidden' }}>
          <div style={{ width: `${(xong / tat.length) * 100}%`, height: '100%', background: 'var(--accent)' }} /></div>
      </div>
      {P.map((p) => (
        <section key={p.phan} className="card overflow-hidden mb-4">
          <div className="card-hd px-4 py-2 font-semibold">{p.phan}</div>
          <table className="tbl"><thead><tr><th style={{ width: 36 }}>#</th><th>Bước</th><th>Vai</th><th>Làm gì</th><th>Kết quả mong đợi</th><th></th></tr></thead>
            <tbody>{p.buoc.map((b) => { n++; return (
              <tr key={n}><td>{n}</td>
                <td className="font-semibold">{b.ten}{b.ghiChu && <div className="text-[11px] font-normal text-[var(--ink-2)]">{b.ghiChu}</div>}</td>
                <td className="text-[12px]">{b.vai}</td><td className="text-[12px]">{b.lam}</td><td className="text-[12px]">{b.kq}</td>
                <td>{b.xong ? <span className="pill pill-stable">Đã xong</span>
                  : b.link.startsWith('http') ? <a className="btn btn-sm" href={b.link} target="_blank" rel="noreferrer">Mở</a>
                  : <Link className="btn btn-sm btn-primary" href={b.link}>Đi tới</Link>}</td></tr>); })}</tbody></table>
        </section>
      ))}
    </>
  );
}
