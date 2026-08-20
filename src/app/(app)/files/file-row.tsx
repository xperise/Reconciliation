'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { guiTepNgay, xoaTep, xemTep } from '@/app/actions';

export function FileActions({ file, laKeToan }: { file: any; laKeToan: boolean }) {
  const router = useRouter();
  const [dangChay, start] = useTransition();
  const [loi, setLoi] = useState('');

  function mo() {
    start(async () => {
      try { window.open(await xemTep(file.storage_path), '_blank'); }
      catch (e) { setLoi(e instanceof Error ? e.message : 'Không mở được.'); }
    });
  }

  function gui() {
    setLoi('');
    start(async () => {
      try { const r = await guiTepNgay(file.id); if (!r.sent) setLoi(r.message); router.refresh(); }
      catch (e) { setLoi(e instanceof Error ? e.message : 'Gửi thất bại.'); }
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
    <div className="flex gap-1.5 justify-end items-center">
      {loi && <span className="text-xs text-[var(--red)] mr-1 max-w-[200px]">{loi}</span>}
      <button className="btn btn-sm" onClick={mo} disabled={dangChay}>Mở</button>
      {laKeToan && !file.sent_at && (
        <>
          <button className="btn btn-sm btn-primary" onClick={gui} disabled={dangChay}>Gửi</button>
          <button className="btn btn-sm btn-danger" onClick={xoa} disabled={dangChay}>Xóa</button>
        </>
      )}
    </div>
  );
}
