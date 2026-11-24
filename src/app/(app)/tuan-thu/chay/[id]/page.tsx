import Link from 'next/link';
import { notFound } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { PageHeader } from '@/components/PageHeader';
import { duocLam, fmtVnd, nguoiTT, nhanThang, TEN_BUOC } from '@/lib/tuan-thu/db';
import { deXuatBuoc, DeXuat } from '@/lib/tuan-thu/de-xuat';
import { TEN_DICH_VU, TEN_MUC_DO, TEN_PHONG_BAN, PhongBan, LoaiDichVu } from '@/lib/tuan-thu/types';
import { thongTinGui } from '../../actions';
import { Duyet, GiaiTrinh, TaiLai, XacNhanMot, XacNhanTatCa } from './panels';
import { ChatAgent, GoiYGiaiTrinh, RaSoat } from '../../agent-ui';

export const dynamic = 'force-dynamic';

const tep = (p?: string | null) => (p ? `/api/tuan-thu/tep?path=${encodeURIComponent(p)}` : null);
const PILL: Record<string, string> = { chan_gui: 'pill-critical', giai_trinh: 'pill-high', theo_doi: 'pill-neutral' };

function KhungDeXuat({ dx }: { dx: DeXuat }) {
  return (
    <div className={`callout ${dx.ket_luan === 'duyet' ? 'callout-stable' : 'callout-high'} mb-3`}>
      <b>Agent đề xuất: {dx.ket_luan === 'duyet' ? 'DUYỆT' : 'CHƯA DUYỆT / TRẢ VỀ'}</b>
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
  const [{ data: aiKq }, { data: chat }] = await Promise.all([
    sb.from('tt_ai_ket_qua').select('phong_ban, noi_dung, luc, skill_phien_ban, vong').eq('lan_chay_id', params.id).eq('loai', 'ra_soat').order('luc', { ascending: false }),
    sb.from('tt_chat').select('phong_ban, vai, noi_dung').eq('user_id', n.id).eq('lan_chay_id', params.id).order('luc'),
  ]);
  const raSoat = (b: string) => ((aiKq ?? []) as any[]).find((k) => k.phong_ban === b && k.vong === lc.vong) ?? null;
  const lichSu: any = {}; for (const m of (chat ?? []) as any[]) (lichSu[m.phong_ban] ??= []).push({ vai: m.vai, noi_dung: m.noi_dung });
  const dyVong = dy.filter((d) => d.vong === lc.vong);
  const hd: any = lc.tt_hop_dong;
  const th: any = lc.tong_hop ?? {};
  const daDuyet = (b: string) => dyVong.find((d) => d.buoc === b && d.quyet_dinh === 'duyet');
  const dx = (b: string) => deXuatBuoc(b, canhBao, thayDoi, dyVong);
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

  const buocDuyet: { b: 'ke_toan' | 'demand' | 'supply' | 'ceo'; ten: string }[] = [
    { b: 'ke_toan', ten: '1–2. Kế toán xác nhận raw & bảng kê' }, { b: 'demand', ten: '3. Demand duyệt' },
    { b: 'supply', ten: '3. Supply duyệt' }, { b: 'ceo', ten: '4. CEO duyệt & gửi' },
  ];

  return (
    <>
      <PageHeader eyebrow={`Lần chạy · ${hd.ma_khach} · quy tắc v${lc.phien_ban_quy_tac}${lc.vong > 1 ? ` · vòng ${lc.vong}` : ''}`}
        title={`Bảng kê ${hd.ten_khach} ${nhanThang(lc.thang, lc.dot)}`}
        description={th.nhan_ky}
        action={<div className="flex gap-2 flex-wrap">
          {tep(lc.bang_ke_path) && <a className="btn btn-sm btn-primary" href={tep(lc.bang_ke_path)!}>Tải bảng kê</a>}
          {tep(lc.bao_cao_path) && <a className="btn btn-sm" href={tep(lc.bao_cao_path)!}>Tải báo cáo kiểm tra</a>}
          {Object.entries(lc.raw_paths ?? {}).map(([k, p]) => <a key={k} className="btn btn-sm" href={tep(p as string)!}>Raw: {(lc.raw_ten ?? {})[k] ?? k}</a>)}
        </div>} />

      {lc.loi && <div className="callout callout-critical mb-4"><b>Lỗi xử lý raw:</b> {lc.loi}</div>}

      {/* Trạng thái các cổng */}
      <div className="grid gap-3 md:grid-cols-4 mb-5">
        {buocDuyet.map(({ b, ten }) => {
          const d = daDuyet(b);
          return (
            <div key={b} className="card card-pad">
              <div className="text-[12px] font-semibold mb-1">{ten}</div>
              {d ? <span className="pill pill-stable">Đã duyệt · {d.nguoi_email}</span>
                : <span className="pill pill-watch">{lc.buoc === 'da_gui' ? '—' : 'Chờ'}</span>}
            </div>
          );
        })}
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
          <h2 className="card-title m-0">App tự sửa theo bộ quy tắc ({thayDoi.length} ô)</h2>
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
              <div><p className="label mb-1">Duyệt chuyển sang Demand & Supply</p><Duyet lanId={lc.id} buoc="ke_toan" nhan="Duyệt, chuyển Demand & Supply" /></div>
              <div><p className="label mb-1">Kế toán tự sửa raw rồi tải lại</p><TaiLai lanId={lc.id} /></div>
            </div>
          ) : <p className="text-[12px]">Chờ kế toán.</p>}
        </section>
      )}

      {/* Bước 3: Demand & Supply */}
      {lc.buoc === 'cho_scope' && (
        <div className="grid gap-4 md:grid-cols-2 mb-5">
          {(['demand', 'supply'] as const).map((b) => (
            <section key={b} className="card card-pad">
              <h2 className="card-title mb-2">Bước 3 · {TEN_PHONG_BAN[b]} duyệt</h2>
              <KhungDeXuat dx={dx(b)} />
              {duocLam(n, b) && !daDuyet(b) && <RaSoat lanChayId={lc.id} buoc={b} ketQua={raSoat(b)} />}
              {daDuyet(b) ? <span className="pill pill-stable">Đã duyệt</span>
                : duocLam(n, b) ? <Duyet lanId={lc.id} buoc={b} /> : <p className="text-[12px]">Chờ {TEN_PHONG_BAN[b]}.</p>}
            </section>
          ))}
        </div>
      )}

      {/* Bước 4: CEO */}
      {(lc.buoc === 'cho_ceo' || lc.buoc === 'da_gui') && gui && (
        <section className="card card-pad mb-5">
          <h2 className="card-title mb-2">Bước 4 · CEO duyệt cuối & gửi</h2>
          {lc.buoc === 'cho_ceo' && <KhungDeXuat dx={dx('ceo')} />}
          {lc.buoc === 'cho_ceo' && duocLam(n, 'ceo') && <RaSoat lanChayId={lc.id} buoc="ceo" ketQua={raSoat('ceo')} />}
          <div className="grid gap-4 md:grid-cols-2 mb-3 text-[12.5px]">
            <div>
              <p className="label mb-1">Thay đổi so với raw</p>
              <ul className="m-0 pl-4">
                <li>App tự sửa {thayDoi.length} ô, kế toán đã xác nhận {thayDoi.length - chuaXn}.</li>
                {[...nhomSua.entries()].map(([k, g]) => <li key={k}>{k}: {g.n} ô, chênh {fmtVnd(g.chenh)}đ</li>)}
                <li>Số lần tải lại raw: {lc.vong - 1}</li>
              </ul>
              <p className="label mt-3 mb-1">Ngoại lệ gửi đi kèm giải trình</p>
              <ul className="m-0 pl-4">{canhBao.filter((c) => c.muc_do !== 'theo_doi').map((c) => (
                <li key={c.id}><b>{c.ma_quy_tac}</b> {c.noi_dung} — <i>{c.giai_trinh ?? 'chưa giải trình'}</i></li>))}</ul>
            </div>
            <div>
              <p className="label mb-1">Thư sẽ gửi</p>
              <div className="text-[12px]"><b>Từ:</b> cs@uts.network<br /><b>Đến:</b> {gui.to || <span className="text-red-600">chưa có email đầu mối</span>}<br />
                <b>CC:</b> {gui.cc || '—'}<br /><b>Tiêu đề:</b> {gui.subject}<br /><b>Đính kèm:</b> {lc.bang_ke_path?.split('/').pop()}</div>
              <div className="mail-body mt-2 text-[12px]" dangerouslySetInnerHTML={{ __html: gui.html }} />
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
      <ChatAgent lanChayId={lc.id} pbs={pbs} lichSu={lichSu} nhanNgCanh={`${hd.ma_khach} ${nhanThang(lc.thang, lc.dot)}`} />
    </>
  );
}
