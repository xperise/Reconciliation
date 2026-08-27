'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { overrideTracking } from '@/app/actions';
import { STATUS_LABEL, TrackingStatus } from '@/lib/types';

/**
 * Trường nhập của form can thiệp. Định nghĩa ở cấp module để ô nhập không mất
 * con trỏ sau mỗi ký tự — component khai bên trong hàm render sẽ bị React coi
 * là kiểu mới mỗi lần state đổi và tháo lắp lại input.
 */
function T({ id, label, type = 'text', hint, value, current, onChange }: {
  id: string; label: string; type?: string; hint?: string;
  value: any; current: any; onChange: (e: any) => void;
}) {
  return (
    <div>
      <label className="label" htmlFor={id}>{label}</label>
      <input id={id} type={type} className="field" value={value ?? ''} onChange={onChange}
             placeholder={current ? String(current) : 'chưa có'} />
      {hint && <p className="text-[11px] text-[var(--ink-3)] mt-1 mb-0 leading-snug">{hint}</p>}
    </div>
  );
}

/**
 * Can thiệp thủ công vào một kỳ đối soát.
 *
 * Mở đủ mọi trường mà workflow tự ghi, để người vận hành sửa được khi hệ thống
 * đi lệch thực tế. Mọi thay đổi vào nhật ký kèm tên người thực hiện, nên mở
 * rộng quyền sửa không làm mất khả năng truy vết.
 */
export function OverrideForm({ row }: { row: any }) {
  const router = useRouter();
  const [mo, setMo] = useState(false);
  const [f, setF] = useState<Record<string, any>>({});
  const [loi, setLoi] = useState('');
  const [dangChay, start] = useTransition();

  const set = (k: string) => (e: any) =>
    setF((p) => ({ ...p, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const bind = (k: string, label: string, type = 'text', hint?: string) => ({
    id: `ov-${row.id}-${k}`, label, type, hint,
    value: f[k], current: row[k], onChange: set(k),
  });

  const num = (k: string) =>
    f[k] === '' || f[k] === undefined ? undefined : Number(f[k]);

  function luu() {
    setLoi('');
    start(async () => {
      try {
        await overrideTracking(row.id, {
          status: (f.status || undefined) as TrackingStatus | undefined,
          thread_id: f.thread_id || undefined,
          message_id: f.message_id || undefined,
          internal_thread_id: f.internal_thread_id || undefined,
          han_chap_nhan: f.han_chap_nhan || undefined,
          ngay_gui_gan_nhat: f.ngay_gui_gan_nhat || undefined,
          ngay_chot: f.ngay_chot || undefined,
          ngay_bat_dau_cho_file: f.ngay_bat_dau_cho_file || undefined,
          escalate_level: num('escalate_level'),
          so_vong_remind: num('so_vong_remind'),
          version_bang_ke: num('version_bang_ke'),
          link_file_bang_ke: f.link_file_bang_ke || undefined,
          link_file_hstt: f.link_file_hstt || undefined,
          ai_de_xuat: f.ai_de_xuat || undefined,
          ai_pham_vi: f.ai_pham_vi || undefined,
          ket_qua_duyet: f.ket_qua_duyet || undefined,
          ghi_chu: f.ghi_chu || undefined,
          ly_do: f.ly_do || undefined,
          reset_remind: !!f.reset_remind,
        });
        setMo(false);
        setF({});
        router.refresh();
      } catch (e) {
        setLoi(e instanceof Error ? e.message : 'Không lưu được.');
      }
    });
  }

  if (!mo) {
    return <button className="btn btn-sm no-print" onClick={() => setMo(true)}>Can thiệp</button>;
  }

  return (
    <div className="modal-scrim" onClick={(e) => { if (e.target === e.currentTarget) setMo(false); }}>
      <div className="modal-box" role="dialog" aria-modal="true">
        <header className="modal-hd">
          <p className="eyebrow">Can thiệp thủ công</p>
          <h2 className="card-title mt-0.5">{row.ten_nhom} — {row.ky_doi_soat}</h2>
          <p className="card-note m-0 mt-1">Để trống là giữ nguyên. Chữ mờ trong ô là giá trị hiện tại.</p>
        </header>

        <div className="modal-bd">
          <div className="flex flex-col gap-5">
            <section>
              <p className="eyebrow mb-2" style={{ color: 'var(--accent)' }}>Trạng thái và mốc thời gian</p>
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="label" htmlFor={`ov-${row.id}-st`}>Trạng thái</label>
                  <select id={`ov-${row.id}-st`} className="field" value={f.status ?? ''} onChange={set('status')}>
                    <option value="">Giữ nguyên — {STATUS_LABEL[row.status as TrackingStatus]}</option>
                    {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <T {...bind('han_chap_nhan', 'Hạn chấp nhận', 'date',
                    'Đổi mốc này là đổi thời điểm WF4 bắt đầu nhắc khách.')} />
                <T {...bind('ngay_gui_gan_nhat', 'Ngày gửi gần nhất', 'date')} />
                <T {...bind('ngay_chot', 'Ngày chốt', 'date')} />
                <T {...bind('ngay_bat_dau_cho_file', 'Mốc bắt đầu chờ file', 'date',
                    'Gốc tính SLA nội bộ D+1 và D+2.')} />
                <div>
                  <label className="label">Nhắc lần cuối</label>
                  <div className="field mono" style={{ background: 'var(--surface-2)', color: 'var(--ink-3)' }}>
                    {row.ngay_remind_cuoi ?? 'chưa nhắc'}
                  </div>
                  <label className="flex items-center gap-2 text-[12px] mt-2 cursor-pointer">
                    <input type="checkbox" checked={!!f.reset_remind} onChange={set('reset_remind')} />
                    Cho phép nhắc lại ngay hôm nay
                  </label>
                </div>
              </div>
            </section>

            <section>
              <p className="eyebrow mb-2" style={{ color: 'var(--accent)' }}>Escalate</p>
              <div className="grid sm:grid-cols-3 gap-3">
                <T {...bind('escalate_level', 'Cấp escalate (0–3)', 'number')} />
                <T {...bind('so_vong_remind', 'Số vòng đã nhắc', 'number')} />
                <T {...bind('version_bang_ke', 'Bản bảng kê', 'number')} />
              </div>
            </section>

            <section>
              <p className="eyebrow mb-2" style={{ color: 'var(--accent)' }}>Thread email</p>
              <div className="grid sm:grid-cols-3 gap-3">
                <T {...bind('thread_id', 'Thread ID khách', 'text', 'Lấy từ URL Gmail, phần sau #thread/')} />
                <T {...bind('message_id', 'Message ID')} />
                <T {...bind('internal_thread_id', 'Thread ID nội bộ')} />
              </div>
            </section>

            <section>
              <p className="eyebrow mb-2" style={{ color: 'var(--accent)' }}>Tệp</p>
              <div className="grid sm:grid-cols-2 gap-3">
                <T {...bind('link_file_bang_ke', 'Link bảng kê')} />
                <T {...bind('link_file_hstt', 'Link hồ sơ thanh toán')} />
              </div>
            </section>

            <section>
              <p className="eyebrow mb-2" style={{ color: 'var(--accent)' }}>Phân loại và ghi chú</p>
              <div className="grid sm:grid-cols-2 gap-3">
                <T {...bind('ai_de_xuat', 'AI đề xuất')} />
                <T {...bind('ai_pham_vi', 'Phạm vi')} />
                <T {...bind('ket_qua_duyet', 'Kết quả duyệt')} />
                <T {...bind('ghi_chu', 'Ghi chú (ghi đè)')} />
              </div>
            </section>

            <section>
              <T {...bind('ly_do', 'Lý do can thiệp', 'text',
                  'Nội dung này đi vào nhật ký, nên viết đủ để người sau hiểu.')} />
            </section>

            {loi && <p role="alert" className="callout callout-critical m-0">{loi}</p>}
          </div>
        </div>

        <footer className="modal-ft">
          <span className="text-[11px] text-[var(--ink-3)] mr-auto self-center">
            Mọi thay đổi được ghi vào nhật ký kèm tên bạn.
          </span>
          <button className="btn" onClick={() => setMo(false)} disabled={dangChay}>Hủy</button>
          <button className="btn btn-primary" onClick={luu} disabled={dangChay}>
            {dangChay ? 'Đang lưu…' : 'Lưu can thiệp'}
          </button>
        </footer>
      </div>
    </div>
  );
}
