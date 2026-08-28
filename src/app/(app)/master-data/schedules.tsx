'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { luuLichGui, xoaLichGui } from '@/app/actions';
import { BillingSchedule } from '@/lib/types';

const THUOC: { v: 'thang_nay' | 'thang_truoc'; nhan: string; mo_ta: string }[] = [
  { v: 'thang_truoc', nhan: 'Tháng trước', mo_ta: 'Gửi trong tháng T+1 cho dữ liệu tháng T' },
  { v: 'thang_nay', nhan: 'Tháng đang gửi', mo_ta: 'Gửi cuối tháng T cho dữ liệu chính tháng T' },
];

type Draft = Partial<BillingSchedule> & { group_id: string };

/**
 * Quản lý lịch gửi của một nhóm khách.
 *
 * Một nhóm có thể có nhiều đợt trong tháng, mỗi đợt có ngày gửi riêng và có
 * thể nhắm vào tháng dữ liệu khác nhau. Kỳ đối soát luôn mang tên tháng của
 * dữ liệu bên trong nó, không phải tháng đem đi gửi.
 */
export function Schedules({ groupId, tenNhom, lich }: {
  groupId: string; tenNhom: string; lich: BillingSchedule[];
}) {
  const router = useRouter();
  const [sua, setSua] = useState<Draft | null>(null);
  const [loi, setLoi] = useState('');
  const [dangChay, start] = useTransition();

  const moThem = () => {
    const dotMoi = Math.max(0, ...lich.map((l) => l.dot)) + 1;
    setSua({
      group_id: groupId, dot: dotMoi, ngay_gui: 30,
      ky_thuoc_thang: 'thang_truoc', enabled: true,
    });
    setLoi('');
  };

  function luu() {
    if (!sua) return;
    setLoi('');
    start(async () => {
      try {
        await luuLichGui({
          id: sua.id,
          groupId,
          dot: Number(sua.dot ?? 1),
          ngayGui: Number(sua.ngay_gui ?? 30),
          kyThuocThang: sua.ky_thuoc_thang ?? 'thang_truoc',
          phamViNhan: sua.pham_vi_nhan ?? undefined,
          slaChapNhan: sua.sla_chap_nhan ?? null,
          enabled: sua.enabled ?? true,
          ghiChu: sua.ghi_chu ?? undefined,
        });
        setSua(null);
        router.refresh();
      } catch (e) {
        setLoi(e instanceof Error ? e.message : 'Không lưu được.');
      }
    });
  }

  function xoa(id: string) {
    if (!confirm('Xoá lịch gửi này?')) return;
    setLoi('');
    start(async () => {
      try { await xoaLichGui(id); router.refresh(); }
      catch (e) { setLoi(e instanceof Error ? e.message : 'Không xoá được.'); }
    });
  }

  const set = (k: keyof BillingSchedule) => (e: any) =>
    setSua((p) => p ? {
      ...p,
      [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value,
    } : p);

  return (
    <div className="card overflow-hidden">
      <div className="card-hd flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="eyebrow">Lịch gửi</p>
          <h2 className="card-title mt-0.5">{tenNhom}</h2>
          <p className="card-note m-0 mt-1">
            Khách gửi một lần mỗi tháng thì chỉ cần một đợt. Thêm đợt khi khách
            nhận bảng kê nhiều lần trong tháng.
          </p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={moThem}>Thêm đợt</button>
      </div>

      {loi && <p role="alert" className="callout callout-critical m-3">{loi}</p>}

      {lich.length ? (
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Đợt</th><th>Phạm vi</th>
                <th className="text-right">Ngày gửi</th>
                <th>Kỳ lấy dữ liệu</th>
                <th className="text-right">SLA riêng</th>
                <th>Trạng thái</th><th className="no-print"></th>
              </tr>
            </thead>
            <tbody>
              {lich.map((l) => (
                <tr key={l.id}>
                  <td className="mono font-semibold">Đợt {l.dot}</td>
                  <td className="text-[12.5px]">{l.pham_vi_nhan || 'Cả tháng'}</td>
                  <td className="text-right mono text-[12px]">ngày {l.ngay_gui}</td>
                  <td className="text-[12px]">
                    {THUOC.find((t) => t.v === l.ky_thuoc_thang)?.nhan}
                  </td>
                  <td className="text-right mono text-[12px] text-[var(--ink-3)]">
                    {l.sla_chap_nhan != null ? `${l.sla_chap_nhan} ngày` : 'theo nhóm'}
                  </td>
                  <td>
                    <span className={`pill ${l.enabled ? 'pill-stable' : 'pill-neutral'}`}>
                      {l.enabled ? 'Đang chạy' : 'Tắt'}
                    </span>
                  </td>
                  <td className="text-right no-print">
                    <div className="flex gap-1.5 justify-end">
                      <button className="btn btn-sm" onClick={() => { setSua(l); setLoi(''); }}>
                        Sửa
                      </button>
                      {lich.length > 1 && (
                        <button className="btn btn-sm btn-danger" onClick={() => xoa(l.id)}>
                          Xoá
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="empty">
          <strong>Nhóm này chưa có lịch gửi nào.</strong>
          Thêm ít nhất một đợt thì workflow mới biết ngày nào gửi bảng kê.
        </p>
      )}

      {sua && (
        <div className="modal-scrim" onClick={(e) => {
          if (e.target === e.currentTarget) setSua(null);
        }}>
          <div className="modal-box" style={{ maxWidth: 560 }} role="dialog" aria-modal="true">
            <header className="modal-hd">
              <p className="eyebrow">Lịch gửi</p>
              <h2 className="card-title mt-0.5">
                {sua.id ? `Sửa đợt ${sua.dot}` : `Thêm đợt ${sua.dot}`} — {tenNhom}
              </h2>
            </header>

            <div className="modal-bd flex flex-col gap-4">
              <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(3, minmax(0,1fr))' }}>
                <div>
                  <label className="label" htmlFor="s-dot">Đợt số</label>
                  <input id="s-dot" type="number" min={1} max={6} className="field mono"
                         value={sua.dot ?? 1} onChange={set('dot')} />
                </div>
                <div>
                  <label className="label" htmlFor="s-ngay">Ngày gửi trong tháng</label>
                  <input id="s-ngay" type="number" min={1} max={31} className="field mono"
                         value={sua.ngay_gui ?? 30} onChange={set('ngay_gui')} />
                  <p className="text-[11px] text-[var(--ink-3)] mt-1 mb-0 leading-snug">
                    Khai 31 thì tháng ngắn hơn sẽ gửi vào ngày cuối tháng.
                  </p>
                </div>
                <div>
                  <label className="label" htmlFor="s-sla">SLA riêng (ngày)</label>
                  <input id="s-sla" type="number" min={1} className="field mono"
                         value={sua.sla_chap_nhan ?? ''} onChange={set('sla_chap_nhan')}
                         placeholder="theo nhóm" />
                </div>
              </div>

              <div>
                <label className="label" htmlFor="s-thuoc">Kỳ này lấy dữ liệu tháng nào</label>
                <select id="s-thuoc" className="field"
                        value={sua.ky_thuoc_thang ?? 'thang_truoc'} onChange={set('ky_thuoc_thang')}>
                  {THUOC.map((t) => <option key={t.v} value={t.v}>{t.nhan}</option>)}
                </select>
                <p className="text-[11.5px] text-[var(--ink-3)] mt-1 mb-0 leading-relaxed">
                  {THUOC.find((t) => t.v === (sua.ky_thuoc_thang ?? 'thang_truoc'))?.mo_ta}.
                  Nhãn kỳ luôn mang tên tháng của dữ liệu, không phải tháng đem đi gửi.
                </p>
              </div>

              <div>
                <label className="label" htmlFor="s-pv">Nhãn phạm vi</label>
                <input id="s-pv" className="field" value={sua.pham_vi_nhan ?? ''}
                       onChange={set('pham_vi_nhan')}
                       placeholder="Ví dụ: Nửa đầu tháng, 01–15, Cả tháng" />
                <p className="text-[11.5px] text-[var(--ink-3)] mt-1 mb-0 leading-relaxed">
                  Hiện trong tiêu đề email và trên màn hình theo dõi. Để trống nghĩa là cả tháng.
                </p>
              </div>

              <div>
                <label className="label" htmlFor="s-gc">Ghi chú</label>
                <input id="s-gc" className="field" value={sua.ghi_chu ?? ''} onChange={set('ghi_chu')} />
              </div>

              <label className="flex items-center gap-2 text-[13px] cursor-pointer">
                <input type="checkbox" checked={sua.enabled ?? true} onChange={set('enabled')} />
                Đợt này đang chạy
              </label>

              {loi && <p role="alert" className="callout callout-critical m-0">{loi}</p>}
            </div>

            <footer className="modal-ft">
              <button className="btn" onClick={() => setSua(null)} disabled={dangChay}>Hủy</button>
              <button className="btn btn-primary" onClick={luu} disabled={dangChay}>
                {dangChay ? 'Đang lưu…' : 'Lưu lịch'}
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}
