'use client';
import { useState } from 'react';

const NHAN: Record<string, string> = {
  'approval.decide': 'Duyệt phản hồi khách',
  'approval.auto_close': 'Chốt mặc định',
  'tracking.override': 'Can thiệp tracking',
  'billing_group.create': 'Thêm nhóm đối soát',
  'billing_group.update': 'Sửa nhóm đối soát',
  'workflow.schedule_update': 'Đổi lịch workflow',
  'workflow.run_manual': 'Chạy workflow thủ công',
  'google.connect': 'Kết nối Google',
  'file.upload': 'Tải tệp lên',
  'file.send': 'Gửi tệp cho khách',
  'file.delete': 'Xóa tệp',
  'user.create': 'Tạo người dùng',
  'user.activate': 'Mở khóa người dùng',
  'user.deactivate': 'Khóa người dùng',
};

/** Nhãn tiếng Việt cho tên cột kỹ thuật, để nhật ký đọc được. */
const TRUONG: Record<string, string> = {
  status: 'Trạng thái',
  thread_id: 'Thread ID khách',
  message_id: 'Message ID',
  internal_thread_id: 'Thread ID nội bộ',
  han_chap_nhan: 'Hạn chấp nhận',
  ngay_gui_gan_nhat: 'Ngày gửi gần nhất',
  ngay_chot: 'Ngày chốt',
  ngay_bat_dau_cho_file: 'Mốc chờ file',
  ngay_remind_cuoi: 'Nhắc lần cuối',
  escalate_level: 'Cấp escalate',
  so_vong_remind: 'Số vòng nhắc',
  version_bang_ke: 'Bản bảng kê',
  link_file_bang_ke: 'Link bảng kê',
  link_file_hstt: 'Link HSTT',
  ai_de_xuat: 'AI đề xuất',
  ai_pham_vi: 'Phạm vi AI',
  ket_qua_duyet: 'Kết quả duyệt',
  ghi_chu: 'Ghi chú',
};

export function AuditRow({ r }: { r: any }) {
  const [mo, setMo] = useState(false);

  const gio = (s: string) =>
    new Date(s).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });

  const before = r.before_data ?? null;
  const after = r.after_data ?? null;
  const thayDoi = after?.thay_doi as Record<string, { tu: any; thanh: any }> | undefined;

  const coChiTiet = Boolean(before || after);

  return (
    <>
      <tr onClick={() => coChiTiet && setMo(!mo)}
          style={coChiTiet ? { cursor: 'pointer' } : undefined} aria-expanded={mo}>
        <td className="mono text-[12px] whitespace-nowrap">{gio(r.created_at)}</td>
        <td className="text-[12px]">{r.actor_email ?? '—'}</td>
        <td className="text-[12.5px] font-semibold">{NHAN[r.action] ?? r.action}</td>
        <td className="mono text-[11.5px] text-[var(--ink-3)]">{r.entity ?? '—'}</td>
        <td className="text-[12px] text-[var(--ink-3)] max-w-[300px] truncate" title={r.note ?? ''}>
          {r.note ?? '—'}
        </td>
        <td className="text-right">
          {coChiTiet && (
            <span className="pill pill-neutral !text-[10.5px]">{mo ? 'Thu gọn' : 'Chi tiết'}</span>
          )}
        </td>
      </tr>

      {mo && (
        <tr>
          <td colSpan={6} style={{ background: 'var(--surface-2)', padding: '16px 20px' }}>
            {thayDoi && Object.keys(thayDoi).length > 0 ? (
              <>
                <p className="label !mb-1.5">Các trường đã đổi</p>
                <div className="card overflow-hidden">
                  <table className="tbl">
                    <thead><tr><th>Trường</th><th>Giá trị cũ</th><th>Giá trị mới</th></tr></thead>
                    <tbody>
                      {Object.entries(thayDoi).map(([k, v]) => (
                        <tr key={k}>
                          <td className="font-semibold text-[12.5px]">{TRUONG[k] ?? k}</td>
                          <td className="mono text-[12px] text-[var(--ink-3)]">
                            {v.tu === null || v.tu === undefined || v.tu === '' ? '—' : String(v.tu)}
                          </td>
                          <td className="mono text-[12px]" style={{ color: 'var(--accent-deep)', fontWeight: 600 }}>
                            {v.thanh === null || v.thanh === undefined ? '—' : String(v.thanh)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
                {before && (
                  <div>
                    <p className="label !mb-1.5">Trước</p>
                    <pre className="text-[11px] leading-relaxed m-0 p-3 rounded-[var(--r-sm)] max-h-72 overflow-auto"
                         style={{ background: 'var(--surface)', border: '1px solid var(--line)' }}>
                      {JSON.stringify(before, null, 2)}
                    </pre>
                  </div>
                )}
                {after && (
                  <div>
                    <p className="label !mb-1.5">Sau</p>
                    <pre className="text-[11px] leading-relaxed m-0 p-3 rounded-[var(--r-sm)] max-h-72 overflow-auto"
                         style={{ background: 'var(--surface)', border: '1px solid var(--line)' }}>
                      {JSON.stringify(after, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
