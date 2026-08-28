'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { guiLoNgay, xoaTep, xemTep } from '@/app/actions';

export function FileActions({ file, laKeToan }: { file: any; laKeToan: boolean }) {
  const router = useRouter();
  const [dangChay, start] = useTransition();
  const [loi, setLoi] = useState('');
  const [hoiGuiLai, setHoiGuiLai] = useState(false);
  const [lyDo, setLyDo] = useState('');
  const [chacChan, setChacChan] = useState(false);

  function mo() {
    start(async () => {
      try { window.open(await xemTep(file.storage_path, file.file_name), '_blank'); }
      catch (e) { setLoi(e instanceof Error ? e.message : 'Không mở được.'); }
    });
  }

  function gui(guiLai?: boolean) {
    setLoi('');
    start(async () => {
      try {
        const r = await guiLoNgay(file.batch_id, guiLai ? { lyDo: lyDo.trim() } : undefined);
        if (!r.sent) setLoi(r.message);
        setHoiGuiLai(false); setLyDo(''); setChacChan(false);
        router.refresh();
      } catch (e) { setLoi(e instanceof Error ? e.message : 'Gửi thất bại.'); }
    });
  }

  function xoa() {
    if (!confirm(`Xóa tệp "${file.file_name}"? Thao tác này không hoàn tác được.`)) return;
    setLoi('');
    start(async () => {
      try { await xoaTep(file.id); router.refresh(); }
      catch (e) { setLoi(e instanceof Error ? e.message : 'Xóa thất bại.'); }
    });
  }

  return (
    <>
      <div className="flex gap-1.5 justify-end items-center">
        {loi && <span className="text-[11px] text-[var(--critical)] mr-1 max-w-[180px]">{loi}</span>}
        <button className="btn btn-sm" onClick={mo} disabled={dangChay}>Mở</button>
        {laKeToan && (
          file.sent_at ? (
            <button className="btn btn-sm" onClick={() => setHoiGuiLai(true)} disabled={dangChay}>
              Gửi lại
            </button>
          ) : (
            <>
              <button className="btn btn-sm btn-primary" onClick={() => gui(false)} disabled={dangChay}>
                Gửi
              </button>
              <button className="btn btn-sm btn-danger" onClick={xoa} disabled={dangChay}>Xóa</button>
            </>
          )
        )}
      </div>

      {hoiGuiLai && (
        <div className="modal-scrim" onClick={(e) => {
          if (e.target === e.currentTarget) setHoiGuiLai(false);
        }}>
          <div className="modal-box" style={{ maxWidth: 520 }} role="dialog" aria-modal="true">
            <header className="modal-hd">
              <p className="eyebrow" style={{ color: 'var(--high)' }}>Xác nhận gửi lại</p>
              <h2 className="card-title mt-0.5">Tệp này đã gửi rồi</h2>
            </header>
            <div className="modal-bd text-left">
              <p className="callout callout-high m-0 mb-3">
                Bạn đã gửi <strong>{file.file_name}</strong> cho{' '}
                <strong>{file.ma_he_thong}</strong> kỳ <strong>{file.ky_doi_soat}</strong>{' '}
                vào ngày <strong>{new Date(file.sent_at).toLocaleDateString('vi-VN')}</strong>.
                Bạn có chắc chắn muốn gửi lại?
              </p>
              <label className="label" htmlFor={`ld-${file.id}`}>Lý do gửi lại — bắt buộc</label>
              <textarea id={`ld-${file.id}`} className="field" rows={2} value={lyDo}
                        onChange={(e) => setLyDo(e.target.value)}
                        placeholder="Ví dụ: khách báo không nhận được thư" />
              <label className="flex items-start gap-2 text-[13px] mt-3 cursor-pointer">
                <input type="checkbox" checked={chacChan} className="mt-0.5"
                       onChange={(e) => setChacChan(e.target.checked)} />
                <span>Tôi chắc chắn muốn gửi lại cho khách hàng này.</span>
              </label>
              <p className="text-[11.5px] text-[var(--ink-3)] mt-3 mb-0 leading-relaxed">
                Thao tác được ghi vào Nhật ký kèm tên bạn và lý do.
              </p>
            </div>
            <footer className="modal-ft">
              <button className="btn" onClick={() => setHoiGuiLai(false)} disabled={dangChay}>
                Bỏ qua
              </button>
              <button className="btn btn-primary" disabled={!chacChan || !lyDo.trim() || dangChay}
                      onClick={() => gui(true)}>
                {dangChay ? 'Đang gửi…' : 'Xác nhận gửi lại'}
              </button>
            </footer>
          </div>
        </div>
      )}
    </>
  );
}
