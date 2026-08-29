'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { luuPhapNhan, xoaPhapNhan } from '@/app/actions';

type Draft = { id?: string; ten: string; vietTat: string; code: string; ngung: boolean; ghiChu: string };

const TRONG: Draft = { ten: '', vietTat: '', code: '', ngung: false, ghiChu: '' };

/**
 * Pháp nhân trực thuộc một nhóm đối soát.
 *
 * Một nhóm nhận chung một bảng kê nhưng có thể gồm nhiều công ty con — ROX có
 * hơn bốn mươi. Danh sách này phục vụ tra cứu và xuất hoá đơn, không ảnh hưởng
 * tới việc gửi thư: workflow chỉ làm việc ở cấp nhóm.
 */
export function PhapNhan({ groupId, tenNhom, danhSach }: {
  groupId: string; tenNhom: string; danhSach: any[];
}) {
  const router = useRouter();
  const [sua, setSua] = useState<Draft | null>(null);
  const [tim, setTim] = useState('');
  const [loi, setLoi] = useState('');
  const [dangChay, start] = useTransition();

  const loc = tim.trim().toLowerCase();
  const hien = loc
    ? danhSach.filter((c) =>
        [c.ten_khach_hang, c.ten_viet_tat, c.code]
          .some((v) => String(v ?? '').toLowerCase().includes(loc)))
    : danhSach;

  function luu() {
    if (!sua) return;
    setLoi('');
    start(async () => {
      try {
        await luuPhapNhan({
          id: sua.id, groupId,
          tenKhachHang: sua.ten, tenVietTat: sua.vietTat,
          code: sua.code, ngungHopTac: sua.ngung, ghiChu: sua.ghiChu,
        });
        setSua(null);
        router.refresh();
      } catch (e) { setLoi(e instanceof Error ? e.message : 'Không lưu được.'); }
    });
  }

  function xoa(c: any) {
    if (!confirm(`Xoá pháp nhân "${c.ten_khach_hang}" khỏi nhóm ${tenNhom}?`)) return;
    setLoi('');
    start(async () => {
      try { await xoaPhapNhan(c.id); router.refresh(); }
      catch (e) { setLoi(e instanceof Error ? e.message : 'Không xoá được.'); }
    });
  }

  return (
    <div className="card overflow-hidden">
      <div className="card-hd flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="eyebrow">Pháp nhân trực thuộc</p>
          <h2 className="card-title mt-0.5">{tenNhom} — {danhSach.length} pháp nhân</h2>
          <p className="card-note m-0 mt-1">
            Các công ty con nhận chung một bảng kê. Danh sách phục vụ tra cứu và xuất
            hoá đơn; workflow gửi thư ở cấp nhóm nên thêm bớt ở đây không đổi lịch gửi.
          </p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => { setSua({ ...TRONG }); setLoi(''); }}>
          Thêm pháp nhân
        </button>
      </div>

      {loi && <p role="alert" className="callout callout-critical m-3">{loi}</p>}

      {danhSach.length > 6 && (
        <div className="card-pad !py-2.5" style={{ borderBottom: '1px solid var(--line)' }}>
          <input className="field" value={tim} onChange={(e) => setTim(e.target.value)}
                 placeholder="Tìm theo tên, tên viết tắt hoặc mã" aria-label="Tìm pháp nhân" />
        </div>
      )}

      {hien.length ? (
        <div className="overflow-x-auto" style={{ maxHeight: 380 }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Tên khách hàng</th><th style={{ width: 150 }}>Tên viết tắt</th>
                <th style={{ width: 110 }}>Mã</th><th style={{ width: 90 }}>Trạng thái</th>
                <th style={{ width: 120 }} className="no-print"></th>
              </tr>
            </thead>
            <tbody>
              {hien.map((c) => (
                <tr key={c.id} style={c.ngung_hop_tac ? { opacity: 0.55 } : undefined}>
                  <td className="text-[12.5px]">{c.ten_khach_hang}</td>
                  <td className="text-[12.5px]">{c.ten_viet_tat || '—'}</td>
                  <td className="mono text-[12px]">{c.code || '—'}</td>
                  <td>
                    <span className={`pill ${c.ngung_hop_tac ? 'pill-neutral' : 'pill-stable'}`}>
                      {c.ngung_hop_tac ? 'Ngưng' : 'Đang chạy'}
                    </span>
                  </td>
                  <td className="text-right no-print">
                    <div className="flex gap-1.5 justify-end">
                      <button className="btn btn-sm" onClick={() => setSua({
                        id: c.id, ten: c.ten_khach_hang, vietTat: c.ten_viet_tat ?? '',
                        code: c.code ?? '', ngung: c.ngung_hop_tac, ghiChu: c.ghi_chu ?? '',
                      })}>Sửa</button>
                      <button className="btn btn-sm btn-danger" onClick={() => xoa(c)}>Xoá</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="empty">
          <strong>{danhSach.length ? 'Không có pháp nhân nào khớp.' : 'Nhóm này chưa có pháp nhân nào.'}</strong>
          {danhSach.length ? 'Thử từ khoá khác.' : 'Thêm để tra cứu được khi xuất hoá đơn.'}
        </p>
      )}

      {sua && (
        <div className="modal-scrim" onClick={(e) => { if (e.target === e.currentTarget) setSua(null); }}>
          <div className="modal-box" style={{ maxWidth: 560 }} role="dialog" aria-modal="true">
            <header className="modal-hd">
              <p className="eyebrow">Pháp nhân</p>
              <h2 className="card-title mt-0.5">
                {sua.id ? 'Sửa pháp nhân' : 'Thêm pháp nhân'} — {tenNhom}
              </h2>
            </header>
            <div className="modal-bd flex flex-col gap-3">
              <div>
                <label className="label" htmlFor="pn-ten">Tên khách hàng đầy đủ</label>
                <input id="pn-ten" className="field" value={sua.ten}
                       onChange={(e) => setSua({ ...sua, ten: e.target.value })} />
              </div>
              <div className="grid gap-3" style={{ gridTemplateColumns: 'minmax(0,2fr) minmax(0,1fr)' }}>
                <div>
                  <label className="label" htmlFor="pn-vt">Tên viết tắt</label>
                  <input id="pn-vt" className="field" value={sua.vietTat}
                         onChange={(e) => setSua({ ...sua, vietTat: e.target.value })} />
                </div>
                <div>
                  <label className="label" htmlFor="pn-code">Mã</label>
                  <input id="pn-code" className="field mono" value={sua.code}
                         onChange={(e) => setSua({ ...sua, code: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="label" htmlFor="pn-gc">Ghi chú</label>
                <input id="pn-gc" className="field" value={sua.ghiChu}
                       onChange={(e) => setSua({ ...sua, ghiChu: e.target.value })} />
              </div>
              <label className="flex items-center gap-2 text-[13px] cursor-pointer">
                <input type="checkbox" checked={sua.ngung}
                       onChange={(e) => setSua({ ...sua, ngung: e.target.checked })} />
                Pháp nhân này đã ngưng hợp tác
              </label>
              {loi && <p role="alert" className="callout callout-critical m-0">{loi}</p>}
            </div>
            <footer className="modal-ft">
              <button className="btn" onClick={() => setSua(null)} disabled={dangChay}>Hủy</button>
              <button className="btn btn-primary" onClick={luu} disabled={dangChay || !sua.ten.trim()}>
                {dangChay ? 'Đang lưu…' : 'Lưu'}
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}
