'use client';
import { useState } from 'react';

/**
 * Một dòng tracking. Các cột hay dùng hiện thẳng; bấm vào dòng để mở hàng phụ
 * chứa toàn bộ trường còn lại — thread ID, message ID, ghi chú, phân loại AI,
 * danh sách pháp nhân trực thuộc.
 */
export function RowDetail({ row, phapNhan, tre, badge, rail, action }: {
  row: any;
  phapNhan: any[];
  tre: number | null;
  badge: React.ReactNode;
  rail: React.ReactNode;
  action: React.ReactNode;
}) {
  const [mo, setMo] = useState(false);

  const F = ({ k, v, mono = false }: { k: string; v: any; mono?: boolean }) => (
    <div className="min-w-0">
      <div className="label !mb-0.5">{k}</div>
      <div className={`text-[12.5px] break-words ${mono ? 'mono' : ''}`}
           style={{ color: v ? 'var(--ink-2)' : 'var(--ink-3)' }}>
        {v || '—'}
      </div>
    </div>
  );

  return (
    <>
      <tr onClick={() => setMo(!mo)} style={{ cursor: 'pointer' }}
          aria-expanded={mo}>
        <td>
          <span className="font-semibold">{row.ten_nhom}</span>
          <span className="sub mono">{row.ma_he_thong}</span>
        </td>
        <td className="mono text-[12px] whitespace-nowrap">
          {row.ky_doi_soat}
          {(row.pham_vi_nhan || row.dot > 1) && (
            <span className="sub">{row.pham_vi_nhan || `Đợt ${row.dot}`}</span>
          )}
        </td>
        <td>{badge}</td>
        <td>{rail}</td>
        <td className="text-right mono text-[12px] whitespace-nowrap"
            style={tre !== null && tre > 0
              ? { color: 'var(--critical)', fontWeight: 600 } : undefined}>
          {row.han_chap_nhan ?? '—'}
          {tre !== null && tre > 0 && <span className="sub" style={{ color: 'var(--critical)' }}>trễ {tre} ngày</span>}
        </td>
        <td className="text-right mono text-[12px] whitespace-nowrap text-[var(--ink-3)]">
          {row.ngay_gui_gan_nhat ?? '—'}
        </td>
        <td className="text-right mono text-[12px] whitespace-nowrap text-[var(--ink-3)]">
          {row.ngay_chot ?? '—'}
        </td>
        <td>
          {row.link_file_bang_ke ? (
            <a href={row.link_file_bang_ke} target="_blank" rel="noreferrer"
               onClick={(e) => e.stopPropagation()}
               className="mono text-[12px] no-underline" style={{ color: 'var(--accent-deep)' }}>
              bản {row.version_bang_ke} ↗
            </a>
          ) : <span className="text-[var(--ink-3)]">—</span>}
        </td>
        <td className="text-[12px]">
          {row.ket_qua_duyet
            ? <span className="pill pill-neutral">{row.ket_qua_duyet}</span>
            : <span className="text-[var(--ink-3)]">—</span>}
        </td>
        <td className="text-right no-print" onClick={(e) => e.stopPropagation()}>{action}</td>
      </tr>

      {mo && (
        <tr>
          <td colSpan={10} style={{ background: 'var(--surface-2)', padding: '16px 20px' }}>
            <div className="grid gap-x-6 gap-y-4"
                 style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
              <F k="Thread ID khách" v={row.thread_id} mono />
              <F k="Message ID" v={row.message_id} mono />
              <F k="Thread ID nội bộ" v={row.internal_thread_id} mono />
              <F k="Đợt trong tháng" v={`Đợt ${row.dot ?? 1}`} mono />
              <F k="Phạm vi kỳ" v={row.pham_vi_nhan || 'Cả tháng'} />
              <F k="Mốc chờ file" v={row.ngay_bat_dau_cho_file} mono />
              <F k="Nhắc lần cuối" v={row.ngay_remind_cuoi} mono />
              <F k="Cấp escalate" v={`${row.escalate_level} / vòng ${row.so_vong_remind + 1}`} mono />
              <F k="AI đề xuất" v={row.ai_de_xuat} />
              <F k="Phạm vi AI" v={row.ai_pham_vi} />
              <F k="Độ tin cậy AI" v={row.ai_do_tin_cay != null ? `${Math.round(row.ai_do_tin_cay * 100)}%` : null} mono />
              <F k="Tên file đã gửi" v={row.ten_file_da_gui} />
              <F k="Link hồ sơ thanh toán"
                 v={row.link_file_hstt ? 'có' : null} />
              <F k="Tên file HSTT" v={row.ten_file_hstt_da_gui} />
            </div>

            {row.ghi_chu && (
              <div className="mt-4">
                <div className="label !mb-1">Ghi chú</div>
                <p className="text-[12.5px] whitespace-pre-line m-0 leading-relaxed text-[var(--ink-2)]">
                  {row.ghi_chu}
                </p>
              </div>
            )}

            {row.email_khach_goc && (
              <details className="mt-4">
                <summary className="cursor-pointer text-[12px] font-semibold select-none"
                         style={{ color: 'var(--accent-deep)' }}>
                  Nguyên văn email khách
                </summary>
                <pre className="mt-2 p-3 rounded-[var(--r-sm)] text-[11.5px] leading-relaxed
                  whitespace-pre-wrap m-0 max-h-64 overflow-auto"
                  style={{ background: 'var(--surface)', border: '1px solid var(--line)', fontFamily: 'inherit' }}>
                  {row.email_khach_goc}
                </pre>
              </details>
            )}

            <div className="mt-4">
              <div className="label !mb-1.5">Pháp nhân trực thuộc ({phapNhan.length})</div>
              {phapNhan.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {phapNhan.map((c) => (
                    <span key={c.id ?? c.ten_khach_hang} className="pill pill-neutral !text-[11px]"
                          title={c.ten_khach_hang}>
                      {c.ten_viet_tat || c.ten_khach_hang}
                      {c.code && <span className="mono text-[var(--ink-3)]"> · {c.code}</span>}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-[12px] text-[var(--ink-3)] m-0">Chưa gắn pháp nhân nào.</p>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
