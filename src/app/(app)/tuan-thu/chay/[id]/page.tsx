import Link from 'next/link';
import { notFound } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { PageHeader } from '@/components/PageHeader';
import { duocLam, fmtVnd, nguoiTT, nhanThang, TEN_BUOC } from '@/lib/tuan-thu/db';
import { deXuatBuoc, DeXuat } from '@/lib/tuan-thu/de-xuat';
import { TEN_DICH_VU, TEN_MUC_DO, TEN_PHONG_BAN, PhongBan, LoaiDichVu } from '@/lib/tuan-thu/types';
import { thongTinGui } from '../../actions';
import { ChonBan, Duyet, GiaiTrinh, GoChan, KiemSoat, TaiLai, XacNhanMot, XacNhanTatCa } from './panels';
import { GoiYGiaiTrinh, RaSoat } from '../../agent-ui';

export const dynamic = 'force-dynamic';

const tep = (p?: string | null) => (p ? `/api/tuan-thu/tep?path=${encodeURIComponent(p)}` : null);
const PILL: Record<string, string> = { chan_gui: 'pill-critical', giai_trinh: 'pill-high', theo_doi: 'pill-neutral' };

function KhungDeXuat({ dx, kiemSoat }: { dx: DeXuat; kiemSoat?: boolean }) {
  return (
    <div className={`callout ${dx.ket_luan === 'duyet' ? 'callout-stable' : 'callout-high'} mb-3`}>
      <b>Agent đề xuất: {kiemSoat ? (dx.ket_luan === 'duyet' ? 'KHÔNG CẦN CHẶN' : 'NÊN CHẶN HOẶC TRẢ VỀ') : (dx.ket_luan === 'duyet' ? 'DUYỆT' : 'CHƯA DUYỆT / TRẢ VỀ')}</b>
      {dx.ly_do.length > 0 && <ul className="m-0 pl-4">{dx.ly_do.map((x, i) => <li key={i}>{x}</li>)}</ul>}
      {dx.luu_y.length > 0 && <div className="mt-1"><b>Lưu ý:</b><ul className="m-0 pl-4">{dx.luu_y.map((x, i) => <li key={i}>{x}</li>)}</ul></div>}
    </div>
  );
}

export default async function Page({ params }: { params: { id: string } }) {
  const sb = supabaseAdmin();
  const n = (await nguoiTT())!;
  const { data: lc } = await sb.from('tt_lan_chay').select('*, tt_hop_dong(*)').eq('id', params.id).maybeSingle();
  if (!lc) notFound();
  const [{ data: cb }, { data: td }, { data: dyAll }] = await Promise.all([
    sb.from('tt_canh_bao').select('*').eq('lan_chay_id', lc.id).order('id'),
    sb.from('tt_thay_doi').select('*').eq('lan_chay_id', lc.id).order('id').limit(5000),
    sb.from('tt_duyet').select('*').eq('lan_chay_id', lc.id).order('luc', { ascending: false }),
  ]);
  const canhBao = (cb ?? []) as any[], thayDoi = (td ?? []) as any[], dy = ((dyAll ?? []) as any[]);
  // Agent AI (SQL 39): kết quả rà soát mới nhất của vòng hiện tại + lịch sử chat của người đang xem
  const pbs = (['ke_toan', 'demand', 'supply', 'ceo'] as PhongBan[]).filter((p) => duocLam(n, p));
  const [{ data: aiKq }, { data: suaTay }] = await Promise.all([
    sb.from('tt_ai_ket_qua').select('phong_ban, noi_dung, luc, skill_phien_ban, vong').eq('lan_chay_id', params.id).eq('loai', 'ra_soat').order('luc', { ascending: false }),
    sb.from('tt_sua_tay').select('*').eq('lan_chay_id', params.id).order('id'),
  ]);
  const { data: chanAll } = await sb.from('tt_chan').select('*').eq('lan_chay_id', params.id).order('luc', { ascending: false });
  const chanDs = (chanAll ?? []) as any[], dangChanDs = chanDs.filter((c) => !c.go_luc);
  const raSoat = (b: string) => ((aiKq ?? []) as any[]).find((k) => k.phong_ban === b && k.vong === lc.vong) ?? null;

  const dyVong = dy.filter((d) => d.vong === lc.vong);
  const hd: any = lc.tt_hop_dong;
  const th: any = lc.tong_hop ?? {};
  const daDuyet = (b: string) => dyVong.find((d) => d.buoc === b && d.quyet_dinh === 'duyet');
  const daFormat = lc.che_do === 'da_format';
  const dx = (b: string) => deXuatBuoc(b, canhBao, thayDoi, dyVong, b === 'ceo' ? dangChanDs : [], { chuaChonBan: daFormat && !lc.ban_gui, banGui: lc.ban_gui });
  const chuaXn = thayDoi.filter((t) => !t.xac_nhan).length;
  const suaKeToan = duocLam(n, 'ke_toan') && lc.buoc === 'cho_ke_toan';
  const gui = lc.buoc === 'cho_ceo' || lc.buoc === 'da_gui' ? await thongTinGui(lc.id) : null;

  // Tóm tắt nhật ký tự sửa theo quy tắc + cột
  const nhomSua = new Map<string, { n: number; chenh: number; xn: number }>();
  for (const t of thayDoi) {
    const k = `${t.ma_quy_tac} · ${TEN_DICH_VU[t.loai as LoaiDichVu]} · ${t.cot}`;
    const g = nhomSua.get(k) ?? { n: 0, chenh: 0, xn: 0 };
    g.n++; g.chenh += Number(t.sau) - Number(t.truoc); if (t.xac_nhan) g.xn++; nhomSua.set(k, g);
  }

  return (
    <>
      <PageHeader eyebrow={`Lần chạy · ${hd.ma_khach} · quy tắc v${lc.phien_ban_quy_tac}${lc.vong > 1 ? ` · vòng ${lc.vong}` : ''}`}
        title={`Bảng kê ${hd.ten_khach} ${nhanThang(lc.thang, lc.dot)}`}
        description={th.nhan_ky}
        action={<div className="flex gap-2 flex-wrap">
          {daFormat ? <>
            {tep(lc.bk_goc_path) && <a className="btn btn-sm" href={tep(lc.bk_goc_path)!}>Bảng kê kế toán upload</a>}
            {tep(lc.bk_sua_path) && <a className="btn btn-sm btn-primary" href={tep(lc.bk_sua_path)!}>Bản đã sửa theo quy tắc</a>}
          </> : tep(lc.bang_ke_path) && <a className="btn btn-sm btn-primary" href={tep(lc.bang_ke_path)!}>Tải bảng kê</a>}
          {tep(lc.bao_cao_path) && <a className="btn btn-sm" href={tep(lc.bao_cao_path)!}>Tải báo cáo kiểm tra</a>}
          {Object.entries(lc.raw_paths ?? {}).map(([k, p]) => <a key={k} className="btn btn-sm" href={tep(p as string)!}>Raw: {(lc.raw_ten ?? {})[k] ?? k}</a>)}
        </div>} />

      {lc.loi && <div className="callout callout-critical mb-4"><b>Lỗi xử lý:</b> {lc.loi}</div>}
      {daFormat && !lc.loi && (
        <div className="callout callout-accent mb-4 text-[12.5px]">
          <b>Lần chạy từ bảng kê kế toán đã format.</b> Tổng file kế toán upload: {fmtVnd(th.goc?.tong_cong)}đ (chiết khấu {fmtVnd(th.goc?.chiet_khau)}đ){lc.bk_sua_path ? <> · bản đã sửa theo quy tắc: <b>{fmtVnd(th.tong_cong)}đ</b></> : ' · file đã đúng quy tắc, không có bản sửa'}.{' '}
          Bản gửi khách: <b>{lc.ban_gui === 'da_sua' ? 'bản đã sửa theo quy tắc' : lc.ban_gui === 'goc' ? 'bảng kê kế toán upload' : 'chưa chọn'}</b>.
          {lc.buoc === 'cho_ke_toan' && lc.bk_sua_path && duocLam(n, 'ke_toan') && <div className="mt-2"><ChonBan lanId={lc.id} banGui={lc.ban_gui} coBanSua={!!lc.bk_sua_path} /></div>}
        </div>
      )}

      {/* Trạng thái các cổng: kế toán duyệt → (Demand/Supply kiểm soát) → CEO duyệt & gửi */}
      <div className="grid gap-3 md:grid-cols-4 mb-5">
        <div className="card card-pad"><div className="text-[12px] font-semibold mb-1">1–2. Kế toán duyệt</div>
          {daDuyet('ke_toan') ? <span className="pill pill-stable">Đã duyệt · {daDuyet('ke_toan').nguoi_email}</span> : <span className="pill pill-watch">Chờ</span>}</div>
        <div className="card card-pad"><div className="text-[12px] font-semibold mb-1">Demand & Supply kiểm soát</div>
          {dangChanDs.length ? <span className="pill pill-critical">Đang chặn ({dangChanDs.map((c) => TEN_PHONG_BAN[c.phong_ban as PhongBan]).join(', ')})</span> : <span className="pill pill-neutral">Không chặn</span>}</div>
        <div className="card card-pad"><div className="text-[12px] font-semibold mb-1">3. CEO duyệt & gửi</div>
          {daDuyet('ceo') ? <span className="pill pill-stable">Đã duyệt · {daDuyet('ceo').nguoi_email}</span> : <span className="pill pill-watch">{lc.buoc === 'cho_ceo' ? 'Đang chờ' : 'Chờ'}</span>}</div>
        <div className="card card-pad"><div className="text-[12px] font-semibold mb-1">Gửi khách</div>
          {lc.buoc === 'da_gui' ? <span className="pill pill-stable">Đã gửi</span> : <span className="pill pill-neutral">—</span>}</div>
      </div>

      <div className="grid gap-3 md:grid-cols-4 mb-5">
        {[['Vé máy bay', th.tong?.ve_may_bay], ['Khách sạn', th.tong?.khach_san], ['Tổng gửi khách', th.tong_cong],
          ['Bước hiện tại', null]].map(([k, v], i) => (
          <div key={i} className="kpi card card-pad"><div className="kpi-label">{k as string}</div>
            <div className="kpi-num">{i === 3 ? (TEN_BUOC[lc.buoc] ?? lc.buoc) : fmtVnd(v as number)}</div></div>
        ))}
      </div>

      {/* Nhật ký app tự sửa */}
      <section className="card card-pad mb-5">
        <div className="flex items-center justify-between mb-2">
          <h2 className="card-title m-0">{daFormat ? `Bản đã sửa thay đổi so với file kế toán (${thayDoi.length} ô)` : `App tự sửa theo bộ quy tắc (${thayDoi.length} ô)`}</h2>
          {suaKeToan && <XacNhanTatCa lanId={lc.id} con={chuaXn} />}
        </div>
        {thayDoi.length === 0 ? <p className="empty">Raw đã đúng quy tắc, app không phải sửa ô nào.</p> : (
          <>
            <table className="tbl mb-3"><thead><tr><th>Quy tắc · dịch vụ · cột</th><th className="text-right">Số ô</th><th className="text-right">Chênh lệch</th><th>Kế toán xác nhận</th></tr></thead>
              <tbody>{[...nhomSua.entries()].map(([k, g]) => (
                <tr key={k}><td>{k}</td><td className="text-right">{g.n}</td><td className="text-right mono">{fmtVnd(g.chenh)}</td><td>{g.xn}/{g.n}</td></tr>))}</tbody></table>
            <details><summary className="text-[12px] cursor-pointer">Xem từng ô (tối đa 300 dòng)</summary>
              <table className="tbl mt-2"><thead><tr><th>Dòng raw</th><th>Mã GD / số vé</th><th>Cột</th><th className="text-right">Raw</th><th className="text-right">Sau sửa</th><th></th></tr></thead>
                <tbody>{thayDoi.slice(0, 300).map((t) => (
                  <tr key={t.id}><td>{t.dong}</td><td className="mono text-xs">{t.ma_giao_dich}</td><td>{t.cot}</td>
                    <td className="text-right mono">{fmtVnd(t.truoc)}</td><td className="text-right mono">{fmtVnd(t.sau)}</td>
                    <td>{t.xac_nhan ? '✓' : suaKeToan ? <XacNhanMot lanId={lc.id} id={t.id} /> : ''}</td></tr>))}</tbody></table>
            </details>
          </>
        )}
      </section>

      {/* Sửa tay (thường qua agent) */}
      {(suaTay ?? []).length > 0 && (
        <section className="card card-pad mb-5">
          <h2 className="card-title mb-2">Kế toán sửa tay ({(suaTay ?? []).length} ô)</h2>
          <table className="tbl"><thead><tr><th>Dịch vụ</th><th>Dòng raw</th><th>Cột</th><th>Giá trị cũ</th><th>Giá trị mới</th><th>Lý do</th><th>Người · lúc</th></tr></thead>
            <tbody>{((suaTay ?? []) as any[]).map((x) => (
              <tr key={x.id}><td>{TEN_DICH_VU[x.loai as LoaiDichVu]}</td><td>{x.dong}</td><td>{x.cot}</td><td className="text-[12px]">{x.gia_tri_cu}</td><td className="text-[12px] font-semibold">{x.gia_tri_moi}</td>
                <td className="text-[12px]">{x.ly_do}</td><td className="text-[11px]">{x.nguoi_email} · {new Date(x.luc).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}</td></tr>))}</tbody></table>
        </section>
      )}

      {/* Cảnh báo */}
      <section className="card card-pad mb-5">
        <h2 className="card-title mb-2">Cảnh báo theo bộ quy tắc ({canhBao.length})</h2>
        {canhBao.some((c) => c.giai_trinh?.startsWith('[Gợi ý agent')) && <div className="callout callout-high mb-2 text-[12px]">Có giải trình đang là gợi ý của agent. Kế toán đọc, sửa lại và xóa phần [Gợi ý agent…] thì mới được tính là giải trình.</div>}
        <table className="tbl"><thead><tr><th>Mã</th><th>Phòng ban</th><th>Mức độ</th><th>Nội dung</th><th className="text-right">Số tiền</th><th style={{ minWidth: 280 }}>Giải trình của kế toán</th></tr></thead>
          <tbody>{canhBao.map((c) => (
            <tr key={c.id}>
              <td className="mono">{c.ma_quy_tac}</td><td>{TEN_PHONG_BAN[c.phong_ban as PhongBan]}</td>
              <td><span className={`pill ${PILL[c.muc_do]}`}>{TEN_MUC_DO[c.muc_do as keyof typeof TEN_MUC_DO]}</span></td>
              <td className="text-[12px]">{c.noi_dung}{c.dong?.length ? <div className="text-[11px] text-[var(--ink-3)]">Dòng raw: {c.dong.slice(0, 40).join(', ')}{c.dong.length > 40 ? '…' : ''}</div> : null}</td>
              <td className="text-right mono">{c.so_tien !== null ? fmtVnd(c.so_tien) : ''}</td>
              <td>{c.muc_do === 'theo_doi' ? <span className="text-[11px] text-[var(--ink-3)]">Không cần</span>
                : <GiaiTrinh id={c.id} dau={c.giai_trinh ?? ''} sua={suaKeToan} />}</td>
            </tr>))}</tbody></table>
      </section>

      {/* Bước 1–2: kế toán */}
      {lc.buoc === 'cho_ke_toan' && (
        <section className="card card-pad mb-5">
          <h2 className="card-title mb-2">Bước 1–2 · Kế toán xác nhận</h2>
          <KhungDeXuat dx={dx('ke_toan')} />
          {duocLam(n, 'ke_toan') && <div className="flex gap-3 flex-wrap items-start"><RaSoat lanChayId={lc.id} buoc="ke_toan" ketQua={raSoat('ke_toan')} /><GoiYGiaiTrinh lanChayId={lc.id} /></div>}
          {duocLam(n, 'ke_toan') ? (
            <div className="grid gap-5 md:grid-cols-2">
              <div><p className="label mb-1">Duyệt chuyển sang Demand & Supply</p><Duyet lanId={lc.id} buoc="ke_toan" nhan="Duyệt, chuyển CEO" /></div>
              <div><p className="label mb-1">{daFormat ? 'Kế toán sửa file rồi tải lại' : 'Kế toán tự sửa raw rồi tải lại'}</p><TaiLai lanId={lc.id} daFormat={daFormat} /></div>
            </div>
          ) : <p className="text-[12px]">Chờ kế toán.</p>}
        </section>
      )}

      {/* Demand & Supply: không duyệt, nhận cảnh báo và chỉ can thiệp khi cần */}
      {lc.buoc !== 'da_gui' && !lc.loi && (
        <div className="grid gap-4 md:grid-cols-2 mb-5">
          {(['demand', 'supply'] as const).map((b) => {
            const cua = canhBao.filter((c) => c.phong_ban === b && c.muc_do !== 'theo_doi');
            const chanCua = chanDs.filter((c) => c.phong_ban === b);
            return (
              <section key={b} className="card card-pad">
                <h2 className="card-title mb-1">{TEN_PHONG_BAN[b]} kiểm soát</h2>
                <p className="text-[12px] text-[var(--ink-3)] mb-2">Không cần duyệt. {cua.length} cảnh báo thuộc scope; chỉ chặn hoặc trả về khi cần kiểm soát.</p>
                <KhungDeXuat dx={dx(b)} kiemSoat />
                {duocLam(n, b) && <RaSoat lanChayId={lc.id} buoc={b} ketQua={raSoat(b)} />}
                {chanCua.map((c) => (
                  <div key={c.id} className={`callout ${c.go_luc ? 'callout-stable' : 'callout-critical'} mb-2 text-[12px]`}>
                    <b>{c.go_luc ? 'Đã gỡ chặn' : 'Đang chặn'}</b> · {c.nguoi_email} · {new Date(c.luc).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}<br />{c.ly_do}
                    {c.go_luc && <div>Gỡ bởi {c.go_email}{c.go_ghi_chu ? `: ${c.go_ghi_chu}` : ''}</div>}
                    {!c.go_luc && duocLam(n, b) && <div className="mt-2"><GoChan id={c.id} /></div>}
                  </div>
                ))}
                {duocLam(n, b) && <KiemSoat lanId={lc.id} pb={b} coTraVe />}
              </section>
            );
          })}
        </div>
      )}

      {/* Bước 4: CEO */}
      {(lc.buoc === 'cho_ceo' || lc.buoc === 'da_gui') && gui && (
        <section className="card card-pad mb-5">
          <h2 className="card-title mb-2">Bước 4 · CEO duyệt cuối & gửi</h2>
          {lc.buoc === 'cho_ceo' && dangChanDs.length > 0 && <div className="callout callout-critical mb-3"><b>Đang bị chặn — CEO chưa duyệt được.</b><ul className="m-0 pl-4">{dangChanDs.map((c) => <li key={c.id}>{TEN_PHONG_BAN[c.phong_ban as PhongBan]}: {c.ly_do}</li>)}</ul></div>}
          {lc.buoc === 'cho_ceo' && <KhungDeXuat dx={dx('ceo')} />}
          {lc.buoc === 'cho_ceo' && duocLam(n, 'ceo') && <RaSoat lanChayId={lc.id} buoc="ceo" ketQua={raSoat('ceo')} />}
          <div className="grid gap-4 md:grid-cols-2 mb-3 text-[12.5px]">
            <div>
              <p className="label mb-1">Thay đổi so với raw</p>
              <ul className="m-0 pl-4">
                <li>App tự sửa {thayDoi.length} ô, kế toán đã xác nhận {thayDoi.length - chuaXn}.</li>
                {[...nhomSua.entries()].map(([k, g]) => <li key={k}>{k}: {g.n} ô, chênh {fmtVnd(g.chenh)}đ</li>)}
                <li>Kế toán sửa tay {(suaTay ?? []).length} ô (xem bảng Kế toán sửa tay).</li>
                <li>Số vòng làm lại: {lc.vong - 1}</li>
              </ul>
              <p className="label mt-3 mb-1">Demand & Supply kiểm soát</p>
              <ul className="m-0 pl-4">{chanDs.length === 0 ? <li>Không có lần chặn nào.</li> : chanDs.map((c) => <li key={c.id}>{TEN_PHONG_BAN[c.phong_ban as PhongBan]} {c.go_luc ? 'đã chặn rồi gỡ' : 'đang chặn'}: {c.ly_do}{c.go_ghi_chu ? ` — gỡ: ${c.go_ghi_chu}` : ''}</li>)}</ul>
              <p className="label mt-3 mb-1">Ngoại lệ gửi đi kèm giải trình</p>
              <ul className="m-0 pl-4">{canhBao.filter((c) => c.muc_do !== 'theo_doi').map((c) => (
                <li key={c.id}><b>{c.ma_quy_tac}</b> {c.noi_dung} — <i>{c.giai_trinh ?? 'chưa giải trình'}</i></li>))}</ul>
            </div>
            <div>
              <p className="label mb-1">Thư sẽ gửi</p>
              <div className="text-[12px]"><b>Từ:</b> cs@uts.network<br /><b>Đến:</b> {gui.to || <span className="text-red-600">chưa có email đầu mối</span>}<br />
                <b>CC:</b> {gui.cc || '—'}<br /><b>Tiêu đề:</b> {gui.subject}<br /><b>Đính kèm:</b> {lc.bang_ke_path?.split('/').pop() ?? <span className="text-red-600">chưa chọn bản gửi</span>}{daFormat && lc.ban_gui ? ` (${lc.ban_gui === 'da_sua' ? 'bản đã sửa theo quy tắc' : 'bản kế toán upload'})` : ''}</div>
              <iframe title="Xem trước thư gửi khách" className="mt-2 w-full rounded-lg border border-[var(--line)]" style={{ height: 560, background: '#f5f5f5' }} sandbox="" srcDoc={gui.html} />
              <p className="text-[11px] text-[var(--ink-3)] mt-1">Mẫu thư giống WF1; file bảng kê được đính kèm, nút Xem bảng kê dùng liên kết tải có thời hạn tạo lúc gửi.</p>
              {lc.buoc === 'da_gui' && <div className="callout callout-stable mt-2">Đã gửi lúc {new Date(lc.gui_luc).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}.</div>}
            </div>
          </div>
          {lc.buoc === 'cho_ceo' && (duocLam(n, 'ceo')
            ? <Duyet lanId={lc.id} buoc="ceo" nhan="Duyệt & gửi bảng kê cho khách" xacNhan="Duyệt và gửi bảng kê cho khách ngay bây giờ?" />
            : <p className="text-[12px]">Chờ CEO.</p>)}
        </section>
      )}

      {/* Lịch sử */}
      <section className="card card-pad">
        <h2 className="card-title mb-2">Lịch sử duyệt</h2>
        {dy.length === 0 ? <p className="empty">Chưa có.</p> : (
          <table className="tbl"><thead><tr><th>Lúc</th><th>Vòng</th><th>Bước</th><th>Quyết định</th><th>Người</th><th>Ý kiến</th><th>Agent đề xuất lúc đó</th><th>Skill</th></tr></thead>
            <tbody>{dy.map((d) => (
              <tr key={d.id}><td className="text-xs">{new Date(d.luc).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}</td><td>{d.vong}</td>
                <td>{TEN_PHONG_BAN[d.buoc as PhongBan]}</td><td>{d.quyet_dinh === 'duyet' ? 'Duyệt' : 'Trả về'}</td>
                <td className="text-xs">{d.nguoi_email}</td><td className="text-[12px]">{d.y_kien}</td><td className="text-[11px]">{d.de_xuat_agent}</td><td className="text-[11px]">{d.skill_phien_ban ? `v${d.skill_phien_ban}` : ''}</td></tr>))}</tbody></table>
        )}
      </section>
      <p className="mt-4"><Link href="/tuan-thu" className="text-[12px] underline">← Danh sách lần chạy</Link></p>
    </>
  );
}
