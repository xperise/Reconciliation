'use client';
import { useState, useTransition } from 'react';
import { luuNhomDoiSoat } from '@/app/actions';

/**
 * Trường nhập, định nghĩa ở cấp module.
 *
 * Trước đây component này nằm bên trong GroupEditor, nên mỗi lần state đổi
 * React lại thấy một kiểu component mới, tháo input cũ và lắp input mới —
 * con trỏ mất focus sau đúng một ký tự. Đưa ra ngoài thì kiểu component ổn
 * định qua các lần render và ô nhập giữ được focus.
 */
function Field({ id, label, type = 'text', hint, value, onChange }: {
  id: string;
  label: string;
  type?: string;
  hint?: string;
  value: any;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div>
      <label className="label" htmlFor={`f-${id}`}>{label}</label>
      <input id={`f-${id}`} type={type} className="field" value={value ?? ''} onChange={onChange} />
      {hint && <p className="text-[0.6875rem] text-[var(--ink-3)] mt-1 mb-0 leading-snug">{hint}</p>}
    </div>
  );
}

const NHOM_MO_TA: Record<number, string> = {
  1: 'Nhóm 1 — nhắc L1, L2 rồi tự động chốt',
  2: 'Nhóm 2 — nhắc L1→L2→L3, một vòng lặp, cần người quyết định',
  3: 'Nhóm 3 — nhắc L1→L2→L3, hai vòng lặp, cần người quyết định',
};

export function GroupEditor({ group, onClose }: { group: any | null; onClose: () => void }) {
  const [form, setForm] = useState<Record<string, any>>(group ?? {
    nhom_escalate: 2, ngay_gui_bang_ke_thuc_te: 5, sla_chap_nhan_thuc_te: 3,
  });
  const [loi, setLoi] = useState('');
  const [dangChay, start] = useTransition();

  const set = (k: string) => (e: any) =>
    setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const tongDiem = ['diem_gmv', 'diem_company_size', 'diem_tranh_chap', 'diem_phuc_tap']
    .reduce((s, k) => s + (Number(form[k]) || 0), 0);
  const nhomGoiY = tongDiem === 0 ? null : tongDiem <= 5 ? 1 : tongDiem <= 9 ? 2 : 3;

  function luu() {
    setLoi('');
    start(async () => {
      try { await luuNhomDoiSoat(group?.id ?? null, form); onClose(); }
      catch (e) { setLoi(e instanceof Error ? e.message : 'Không lưu được.'); }
    });
  }

  // Cầu nối gọn cho Field: gom sẵn value và onChange theo tên trường
  const bind = (k: string) => ({ id: k, value: form[k], onChange: set(k) });

  return (
    <div className="fixed inset-0 bg-black/35 grid place-items-center p-6 z-50 overflow-auto">
      <div className="card w-full max-w-3xl my-8">
        <header className="px-5 py-4 border-b border-[var(--line)]">
          <h2 className="text-base font-bold m-0">
            {group ? `Sửa nhóm ${group.ten_nhom}` : 'Thêm nhóm đối soát'}
          </h2>
          <p className="text-xs text-[var(--muted)] mt-1 mb-0">
            Một nhóm nhận một bảng kê, một thread email và một đồng hồ SLA.
          </p>
        </header>

        <div className="p-5 space-y-5 max-h-[65vh] overflow-auto">
          <section className="grid sm:grid-cols-2 gap-4">
            <Field {...bind('ma_he_thong')} label="Mã hệ thống"
               hint="Mã ngắn dùng để xếp thư mục trong kho tệp và hiển thị trong bảng."  />
            <Field {...bind('ten_nhom')} label="Tên nhóm hiển thị" hint="Tên xuất hiện trong email gửi khách."  />
          </section>

          <section>
            <p className="eyebrow mb-2">Chấm điểm phân nhóm</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Field {...bind('diem_gmv')} label="GMV (1–3)" type="number"  />
              <Field {...bind('diem_company_size')} label="Quy mô (1–3)" type="number"  />
              <Field {...bind('diem_tranh_chap')} label="Tranh chấp (1–3)" type="number"  />
              <Field {...bind('diem_phuc_tap')} label="Phức tạp (1–3)" type="number"  />
            </div>
            <div className="mt-3 flex flex-wrap items-end gap-4">
              <div className="w-[280px]">
                <label className="label" htmlFor="f-esc">Nhóm escalate</label>
                <select id="f-esc" className="field" value={form.nhom_escalate ?? 2} onChange={set('nhom_escalate')}>
                  {[1, 2, 3].map((n) => <option key={n} value={n}>{NHOM_MO_TA[n]}</option>)}
                </select>
              </div>
              {nhomGoiY && (
                <p className="text-xs text-[var(--muted)] m-0 pb-2">
                  Tổng {tongDiem} điểm → khung điểm gợi ý <strong>nhóm {nhomGoiY}</strong>.
                </p>
              )}
            </div>
          </section>

          <section>
            <p className="eyebrow mb-2">Lịch gửi và SLA</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Field {...bind('ngay_gui_bang_ke_hd')} label="Ngày gửi theo HĐ" type="number"  />
              <Field {...bind('ngay_gui_bang_ke_thuc_te')} label="Ngày gửi thực tế" type="number"
                 hint="Ngày trong tháng hệ thống gửi."  />
              <Field {...bind('sla_chap_nhan_hd')} label="SLA chấp nhận theo HĐ" type="number"  />
              <Field {...bind('sla_chap_nhan_thuc_te')} label="SLA chấp nhận thực tế" type="number" hint="Số ngày."  />
              <Field {...bind('sla_phan_hoi_dieu_chinh')} label="SLA bản điều chỉnh" type="number"  />
              <Field {...bind('sla_ky_bien_ban')} label="SLA ký biên bản" type="number"  />
              <Field {...bind('sla_hstt')} label="SLA hồ sơ thanh toán" type="number"  />
              <Field {...bind('payment_term')} label="Payment term" type="number"  />
            </div>
          </section>

          <section>
            <p className="eyebrow mb-2">Email — nhiều địa chỉ ngăn bằng dấu phẩy</p>
            <div className="grid sm:grid-cols-2 gap-3">
              <Field {...bind('email_l1')} label="Khách L1 (đầu mối)"  />
              <Field {...bind('email_l2')} label="Khách L2"  />
              <Field {...bind('email_l3')} label="Khách L3"  />
              <Field {...bind('email_ke_toan')} label="Nội bộ — kế toán"  />
              <Field {...bind('email_pm')} label="Nội bộ — PM"  />
              <Field {...bind('email_high_level')} label="Nội bộ — cấp quản lý"  />
              <Field {...bind('email_cc')} label="CC thêm"  />
            </div>
          </section>

          <section className="grid sm:grid-cols-2 gap-4">
            <Field {...bind('ho_so_thanh_toan')} label="Hồ sơ thanh toán cần chuẩn bị"
               hint="Để trống nghĩa là chốt bảng kê xong là hoàn tất."  />
            <Field {...bind('ghi_chu')} label="Ghi chú"  />
          </section>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={!!form.ngung_hop_tac} onChange={set('ngung_hop_tac')} />
            Ngưng hợp tác — bỏ qua nhóm này khi chạy workflow
          </label>

          {loi && (
            <p role="alert" className="text-sm text-[var(--red)] bg-[var(--red-wash)] px-3 py-2 rounded-md m-0">
              {loi}
            </p>
          )}
        </div>

        <footer className="px-5 py-4 border-t border-[var(--line)] flex gap-2 justify-end">
          <button className="btn" onClick={onClose} disabled={dangChay}>Hủy</button>
          <button className="btn btn-primary" onClick={luu} disabled={dangChay}>
            {dangChay ? 'Đang lưu…' : 'Lưu nhóm'}
          </button>
        </footer>
      </div>
    </div>
  );
}
