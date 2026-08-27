'use client';

import { useState, useMemo, useRef, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { capNhatO, OMasterData } from '@/app/actions';
import { GroupEditor } from './group-editor';

// =====================================================================
// Khai báo cột
// =====================================================================

type Kieu = 'text' | 'int' | 'bool' | 'chon';

type Cot = {
  k: string;
  ten: string;
  kieu: Kieu;
  w: number;
  /** Cột tính sẵn trong database, chỉ đọc. */
  chiDoc?: boolean;
  chon?: { v: string; nhan: string }[];
  nhom: string;
};

const COT: Cot[] = [
  { k: 'ma_he_thong', ten: 'Mã hệ thống', kieu: 'text', w: 150, nhom: 'Định danh' },
  { k: 'ten_nhom', ten: 'Tên nhóm', kieu: 'text', w: 160, nhom: 'Định danh' },
  { k: 'ngung_hop_tac', ten: 'Ngưng', kieu: 'bool', w: 62, nhom: 'Định danh' },

  { k: 'diem_gmv', ten: 'GMV', kieu: 'int', w: 58, nhom: 'Chấm điểm' },
  { k: 'diem_company_size', ten: 'Quy mô', kieu: 'int', w: 62, nhom: 'Chấm điểm' },
  { k: 'diem_tranh_chap', ten: 'Tranh chấp', kieu: 'int', w: 76, nhom: 'Chấm điểm' },
  { k: 'diem_phuc_tap', ten: 'Phức tạp', kieu: 'int', w: 70, nhom: 'Chấm điểm' },
  { k: 'tong_diem', ten: 'Tổng', kieu: 'int', w: 56, chiDoc: true, nhom: 'Chấm điểm' },
  {
    k: 'nhom_escalate', ten: 'Nhóm', kieu: 'chon', w: 72, nhom: 'Chấm điểm',
    chon: [
      { v: '1', nhan: '1 — tự chốt' },
      { v: '2', nhan: '2 — một vòng' },
      { v: '3', nhan: '3 — hai vòng' },
    ],
  },

  { k: 'ngay_gui_bang_ke_hd', ten: 'Gửi (HĐ)', kieu: 'int', w: 72, nhom: 'Lịch & SLA' },
  { k: 'ngay_gui_bang_ke_thuc_te', ten: 'Gửi (thực tế)', kieu: 'int', w: 88, nhom: 'Lịch & SLA' },
  { k: 'sla_chap_nhan_hd', ten: 'Chấp nhận (HĐ)', kieu: 'int', w: 98, nhom: 'Lịch & SLA' },
  { k: 'sla_chap_nhan_thuc_te', ten: 'Chấp nhận (TT)', kieu: 'int', w: 98, nhom: 'Lịch & SLA' },
  { k: 'sla_phan_hoi_dieu_chinh', ten: 'Bản điều chỉnh', kieu: 'int', w: 96, nhom: 'Lịch & SLA' },
  { k: 'sla_ky_bien_ban', ten: 'Ký biên bản', kieu: 'int', w: 84, nhom: 'Lịch & SLA' },
  { k: 'sla_hstt', ten: 'HSTT', kieu: 'int', w: 62, nhom: 'Lịch & SLA' },
  { k: 'payment_term', ten: 'Payment term', kieu: 'int', w: 96, nhom: 'Lịch & SLA' },

  { k: 'email_l1', ten: 'Khách L1', kieu: 'text', w: 190, nhom: 'Email' },
  { k: 'email_l2', ten: 'Khách L2', kieu: 'text', w: 190, nhom: 'Email' },
  { k: 'email_l3', ten: 'Khách L3', kieu: 'text', w: 190, nhom: 'Email' },
  { k: 'email_ke_toan', ten: 'Kế toán', kieu: 'text', w: 190, nhom: 'Email' },
  { k: 'email_pm', ten: 'PM', kieu: 'text', w: 190, nhom: 'Email' },
  { k: 'email_high_level', ten: 'Cấp quản lý', kieu: 'text', w: 190, nhom: 'Email' },
  { k: 'email_cc', ten: 'CC thêm', kieu: 'text', w: 160, nhom: 'Email' },

  { k: 'ho_so_thanh_toan', ten: 'Hồ sơ thanh toán', kieu: 'text', w: 200, nhom: 'Khác' },
  { k: 'ghi_chu', ten: 'Ghi chú', kieu: 'text', w: 180, nhom: 'Khác' },
];

const NHOM_COT = ['Định danh', 'Chấm điểm', 'Lịch & SLA', 'Email', 'Khác'];

// =====================================================================
// Ô sửa được — khai ở cấp module để không mất con trỏ khi gõ
// =====================================================================

function OSua({ cot, giaTri, dangLuu, loi, onLuu }: {
  cot: Cot;
  giaTri: any;
  dangLuu: boolean;
  loi?: string;
  onLuu: (v: unknown) => void;
}) {
  const [sua, setSua] = useState(false);
  const [nhap, setNhap] = useState('');
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (sua) { ref.current?.focus(); ref.current?.select(); }
  }, [sua]);

  // Ô đúng/sai đổi liên tục nên hiện sẵn, không phải bấm hai lần
  if (cot.kieu === 'bool') {
    return (
      <label className="flex justify-center cursor-pointer" title={cot.ten}>
        <input type="checkbox" checked={!!giaTri} disabled={dangLuu}
               onChange={(e) => onLuu(e.target.checked)} />
      </label>
    );
  }

  // Ô chọn từ danh sách cũng hiện sẵn dạng select
  if (cot.kieu === 'chon') {
    return (
      <select
        className="cell-select" value={giaTri ?? ''} disabled={dangLuu}
        onChange={(e) => onLuu(e.target.value)}
      >
        {cot.chon!.map((o) => <option key={o.v} value={o.v}>{o.nhan}</option>)}
      </select>
    );
  }

  if (cot.chiDoc) {
    return <span className="mono text-[12px] text-[var(--ink-3)]">{giaTri ?? '—'}</span>;
  }

  if (!sua) {
    const rong = giaTri === null || giaTri === undefined || giaTri === '';
    return (
      <button
        className="cell-view"
        data-empty={rong}
        data-err={!!loi}
        title={loi ?? (rong ? 'Bấm để nhập' : String(giaTri))}
        onClick={() => { setNhap(rong ? '' : String(giaTri)); setSua(true); }}
      >
        <span className={cot.kieu === 'int' ? 'mono' : ''}>
          {rong ? '' : String(giaTri)}
        </span>
        {dangLuu && <i className="cell-spin" />}
      </button>
    );
  }

  const ketThuc = (luu: boolean) => {
    setSua(false);
    if (luu && nhap !== (giaTri === null || giaTri === undefined ? '' : String(giaTri))) {
      onLuu(nhap);
    }
  };

  return (
    <input
      ref={ref}
      className="cell-input"
      type={cot.kieu === 'int' ? 'number' : 'text'}
      value={nhap}
      onChange={(e) => setNhap(e.target.value)}
      onBlur={() => ketThuc(true)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); ketThuc(true); }
        if (e.key === 'Escape') { e.preventDefault(); ketThuc(false); }
      }}
    />
  );
}

// =====================================================================
// Lưới
// =====================================================================

type SapXep = { cot: string; chieu: 'tang' | 'giam' } | null;

export function MasterGrid({ rows, laKeToan }: { rows: any[]; laKeToan: boolean }) {
  const router = useRouter();

  /** Giá trị đã sửa nhưng chưa xác nhận từ máy chủ, để cập nhật lạc quan. */
  const [tam, setTam] = useState<Record<string, any>>({});
  const [dangLuu, setDangLuu] = useState<Record<string, boolean>>({});
  const [loiO, setLoiO] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);
  const [, start] = useTransition();

  const [tim, setTim] = useState('');
  const [locNhom, setLocNhom] = useState('');
  const [locCot, setLocCot] = useState<string[]>(NHOM_COT);
  const [chiThieuEmail, setChiThieuEmail] = useState(false);
  const [anNgung, setAnNgung] = useState(false);
  const [sapXep, setSapXep] = useState<SapXep>({ cot: 'ten_nhom', chieu: 'tang' });
  const [sua, setSua] = useState<any | null | undefined>(undefined);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3600);
    return () => clearTimeout(t);
  }, [toast]);

  const val = (r: any, k: string) => {
    const key = `${r.id}:${k}`;
    return key in tam ? tam[key] : r[k];
  };

  async function luuO(r: any, cot: Cot, v: unknown) {
    const key = `${r.id}:${cot.k}`;
    const cu = r[cot.k];

    setTam((p) => ({ ...p, [key]: cot.kieu === 'int' && v !== '' && v !== null ? Number(v) : v }));
    setDangLuu((p) => ({ ...p, [key]: true }));
    setLoiO((p) => { const n = { ...p }; delete n[key]; return n; });

    start(async () => {
      try {
        await capNhatO(r.id, cot.k as OMasterData, v);
        setToast({ kind: 'ok', msg: `Đã lưu ${cot.ten} của ${r.ten_nhom}` });
        router.refresh();
      } catch (e) {
        // Lưu hỏng thì trả ô về giá trị cũ, không để trên màn hình một giá trị
        // chưa hề được ghi xuống database
        setTam((p) => ({ ...p, [key]: cu }));
        const msg = e instanceof Error ? e.message : 'Không lưu được.';
        setLoiO((p) => ({ ...p, [key]: msg }));
        setToast({ kind: 'err', msg });
      } finally {
        setDangLuu((p) => { const n = { ...p }; delete n[key]; return n; });
      }
    });
  }

  const cotHien = useMemo(() => COT.filter((c) => locCot.includes(c.nhom)), [locCot]);

  const duLieu = useMemo(() => {
    let d = [...rows];
    const q = tim.trim().toLowerCase();
    if (q) {
      d = d.filter((r) =>
        [r.ma_he_thong, r.ten_nhom, r.email_l1, r.email_ke_toan, r.ghi_chu]
          .some((v) => String(v ?? '').toLowerCase().includes(q)));
    }
    if (locNhom) d = d.filter((r) => String(r.nhom_escalate) === locNhom);
    if (chiThieuEmail) d = d.filter((r) => !r.email_l1);
    if (anNgung) d = d.filter((r) => !r.ngung_hop_tac);

    if (sapXep) {
      const { cot, chieu } = sapXep;
      d.sort((a, b) => {
        const x = a[cot], y = b[cot];
        if (x === y) return 0;
        if (x === null || x === undefined) return 1;   // ô trống luôn xuống cuối
        if (y === null || y === undefined) return -1;
        const r = typeof x === 'number' && typeof y === 'number'
          ? x - y
          : String(x).localeCompare(String(y), 'vi');
        return chieu === 'tang' ? r : -r;
      });
    }
    return d;
  }, [rows, tim, locNhom, chiThieuEmail, anNgung, sapXep]);

  const doiSap = (k: string) => {
    setSapXep((p) =>
      !p || p.cot !== k ? { cot: k, chieu: 'tang' }
        : p.chieu === 'tang' ? { cot: k, chieu: 'giam' }
        : null);
  };

  const thieuEmail = rows.filter((r) => !r.email_l1).length;
  const soNgung = rows.filter((r) => r.ngung_hop_tac).length;
  const coLoc = tim || locNhom || chiThieuEmail || anNgung;

  return (
    <>
      {/* ---- Thanh lọc ---- */}
      <div className="card card-pad mb-3 no-print">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
          <div className="flex flex-wrap gap-2">
            <button className="chip" data-on={chiThieuEmail} data-zero={thieuEmail === 0}
                    onClick={() => setChiThieuEmail(!chiThieuEmail)}>
              Thiếu email đầu mối <span className="chip-count">{thieuEmail}</span>
            </button>
            <button className="chip" data-on={anNgung} data-zero={soNgung === 0}
                    onClick={() => setAnNgung(!anNgung)}>
              Ẩn nhóm đã ngưng <span className="chip-count">{soNgung}</span>
            </button>
          </div>
          <div className="flex gap-2">
            {coLoc && (
              <button className="btn btn-sm" onClick={() => {
                setTim(''); setLocNhom(''); setChiThieuEmail(false); setAnNgung(false);
              }}>Bỏ lọc</button>
            )}
            {laKeToan && (
              <button className="btn btn-primary btn-sm" onClick={() => setSua(null)}>Thêm nhóm</button>
            )}
          </div>
        </div>

        <div className="grid gap-3" style={{ gridTemplateColumns: 'minmax(0,2fr) minmax(0,1fr) minmax(0,3fr)' }}>
          <div>
            <label className="label" htmlFor="md-tim">Tìm kiếm</label>
            <input id="md-tim" className="field" value={tim} onChange={(e) => setTim(e.target.value)}
                   placeholder="Mã, tên nhóm, email, ghi chú" />
          </div>
          <div>
            <label className="label" htmlFor="md-nhom">Nhóm escalate</label>
            <select id="md-nhom" className="field" value={locNhom} onChange={(e) => setLocNhom(e.target.value)}>
              <option value="">Tất cả</option>
              <option value="1">Nhóm 1</option>
              <option value="2">Nhóm 2</option>
              <option value="3">Nhóm 3</option>
            </select>
          </div>
          <div>
            <span className="label">Nhóm cột hiển thị</span>
            <div className="flex flex-wrap gap-1.5">
              {NHOM_COT.map((n) => (
                <button key={n} className="chip" data-on={locCot.includes(n)}
                        onClick={() => setLocCot((p) =>
                          p.includes(n) ? p.filter((x) => x !== n) : [...p, n])}>
                  {n}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ---- Lưới ---- */}
      <div className="card overflow-hidden">
        <div className="card-hd flex flex-wrap items-center justify-between gap-2 !py-2.5">
          <p className="card-note m-0">
            Hiện <span className="mono font-semibold">{duLieu.length}</span>
            {duLieu.length !== rows.length && <span className="mono">/{rows.length}</span>} nhóm.
            {laKeToan && ' Bấm vào ô để sửa, Enter lưu, Escape hủy.'}
          </p>
          <p className="card-note m-0">Cuộn ngang để xem hết cột.</p>
        </div>

        {duLieu.length ? (
          <div className="grid-wrap">
            <table className="grid-tbl">
              <thead>
                <tr>
                  <th className="pin pin-1" style={{ width: 34 }}>#</th>
                  {cotHien.map((c, i) => (
                    <th
                      key={c.k}
                      className={i === 0 ? 'pin pin-2' : undefined}
                      style={{ width: c.w, minWidth: c.w }}
                      onClick={() => doiSap(c.k)}
                      title="Bấm để sắp xếp"
                    >
                      <span className="th-in">
                        {c.ten}
                        <i className="th-sort" data-on={sapXep?.cot === c.k}>
                          {sapXep?.cot === c.k ? (sapXep.chieu === 'tang' ? '▲' : '▼') : '⇅'}
                        </i>
                      </span>
                    </th>
                  ))}
                  {laKeToan && <th className="pin-r no-print" style={{ width: 62 }}></th>}
                </tr>
              </thead>
              <tbody>
                {duLieu.map((r, idx) => (
                  <tr key={r.id} data-off={!!val(r, 'ngung_hop_tac')}>
                    <td className="pin pin-1 mono text-[11px] text-[var(--ink-3)] text-center">{idx + 1}</td>
                    {cotHien.map((c, i) => {
                      const key = `${r.id}:${c.k}`;
                      return (
                        <td key={c.k} className={i === 0 ? 'pin pin-2' : undefined}>
                          {laKeToan ? (
                            <OSua
                              cot={c}
                              giaTri={val(r, c.k)}
                              dangLuu={!!dangLuu[key]}
                              loi={loiO[key]}
                              onLuu={(v) => luuO(r, c, v)}
                            />
                          ) : (
                            <span className={c.kieu === 'int' ? 'mono text-[12px]' : 'text-[12.5px]'}>
                              {c.kieu === 'bool'
                                ? (val(r, c.k) ? 'có' : '')
                                : (val(r, c.k) ?? '—')}
                            </span>
                          )}
                        </td>
                      );
                    })}
                    {laKeToan && (
                      <td className="pin-r no-print text-center">
                        <button className="btn btn-sm" onClick={() => setSua(r)}>Dòng</button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty">
            <strong>{rows.length ? 'Không nhóm nào khớp bộ lọc.' : 'Chưa có nhóm đối soát nào.'}</strong>
            {rows.length
              ? 'Thử bỏ bớt điều kiện lọc ở trên.'
              : 'Thêm nhóm đầu tiên, hoặc nhập hàng loạt bằng tệp SQL trong thư mục supabase.'}
          </p>
        )}
      </div>

      {sua !== undefined && (
        <GroupEditor group={sua} onClose={() => { setSua(undefined); router.refresh(); }} />
      )}

      {toast && <div className="toast" data-kind={toast.kind} role="status">{toast.msg}</div>}
    </>
  );
}
