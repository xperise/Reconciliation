'use client';
import { useState } from 'react';

const NHAN: Record<string, string> = {
  success: 'Thành công', partial: 'Có lỗi lẻ', error: 'Lỗi', running: 'Đang chạy',
};
const TONE: Record<string, string> = {
  success: 'pill-stable', partial: 'pill-high', error: 'pill-critical', running: 'pill-watch',
};

/**
 * Một lượt chạy workflow. Bấm vào dòng để mở danh sách thư đã gửi trong lượt
 * đó — ai nhận, thư gì, kỳ nào — cùng diễn biến từng nhóm.
 */
export function RunRow({ r }: { r: any }) {
  const [mo, setMo] = useState(false);

  const detail = r.detail ?? {};
  const mails: any[] = Array.isArray(detail.mails) ? detail.mails : [];
  const buoc: any[] = Array.isArray(detail.buoc) ? detail.buoc
    : Array.isArray(detail) ? detail : [];

  const gio = (s: string) =>
    new Date(s).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });

  return (
    <>
      <tr onClick={() => setMo(!mo)} style={{ cursor: 'pointer' }} aria-expanded={mo}>
        <td className="mono text-[12px] whitespace-nowrap">{gio(r.started_at)}</td>
        <td className="mono uppercase text-[12px]">{r.workflow_key}</td>
        <td className="text-[12px]">{r.trigger_by === 'manual' ? 'Chạy tay' : 'Theo lịch'}</td>
        <td><span className={`pill pill-dot ${TONE[r.status] ?? 'pill-neutral'}`}>{NHAN[r.status] ?? r.status}</span></td>
        <td className="text-right mono text-[12px]">{r.items_ok}</td>
        <td className="text-right mono text-[12px]"
            style={r.items_failed ? { color: 'var(--critical)', fontWeight: 600 } : undefined}>
          {r.items_failed}
        </td>
        <td className="text-right mono text-[12px]">
          {mails.length ? <span className="pill pill-neutral">{mails.length} thư</span>
            : <span className="text-[var(--ink-3)]">—</span>}
        </td>
        <td className="text-[12px] text-[var(--ink-3)] max-w-[340px] truncate" title={r.summary ?? ''}>
          {r.summary ?? '—'}
        </td>
      </tr>

      {mo && (
        <tr>
          <td colSpan={8} style={{ background: 'var(--surface-2)', padding: '16px 20px' }}>
            <div className="mb-4">
              <p className="label !mb-1.5">Thư đã gửi trong lượt này</p>
              {mails.length ? (
                <div className="card overflow-hidden">
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>Loại thư</th><th>Nhóm khách</th><th>Kỳ</th>
                        <th>Gửi đến</th><th>CC</th><th>Tiêu đề</th><th className="text-right">Lúc</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mails.map((m, i) => (
                        <tr key={i}>
                          <td><span className="pill pill-neutral">{m.loai}</span></td>
                          <td className="font-semibold">{m.nhom}</td>
                          <td className="mono text-[12px]">{m.ky}</td>
                          <td className="text-[12px]">{m.den}</td>
                          <td className="text-[11.5px] text-[var(--ink-3)] max-w-[200px] truncate"
                              title={m.cc ?? ''}>{m.cc ?? '—'}</td>
                          <td className="text-[11.5px] max-w-[260px] truncate" title={m.tieu_de}>{m.tieu_de}</td>
                          <td className="text-right mono text-[11.5px] whitespace-nowrap">
                            {m.luc ? new Date(m.luc).toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-[12px] text-[var(--ink-3)] m-0">
                  Lượt này không gửi thư nào.
                </p>
              )}
            </div>

            {buoc.length > 0 && (
              <details>
                <summary className="cursor-pointer text-[12px] font-semibold select-none"
                         style={{ color: 'var(--accent-deep)' }}>
                  Diễn biến từng nhóm ({buoc.length})
                </summary>
                <div className="mt-2 card overflow-hidden">
                  <table className="tbl">
                    <thead><tr><th>Nhóm</th><th>Kỳ</th><th>Diễn biến</th></tr></thead>
                    <tbody>
                      {buoc.map((b, i) => (
                        <tr key={i}>
                          <td className="mono text-[12px]">{b.nhom ?? '—'}</td>
                          <td className="mono text-[12px]">{b.ky ?? '—'}</td>
                          <td className="text-[12px]">
                            {b.msg}
                            {b.error && (
                              <span className="sub" style={{ color: 'var(--critical)' }}>{b.error}</span>
                            )}
                            {b.reason && <span className="sub">{b.reason}</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
