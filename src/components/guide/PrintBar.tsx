'use client';
// Thanh trên trang in: tự mở hộp thoại in khi ảnh đã tải xong; không hiện trong bản PDF
import { useEffect } from 'react';

export default function PrintBar({ drafts }: { drafts: number }) {
  useEffect(() => {
    const imgs = Array.from(document.images);
    Promise.all(imgs.map((i) => (i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; })))).then(() => setTimeout(() => window.print(), 400));
  }, []);
  return (
    <div className="hd-print-bar">
      <span>Chọn <b>“Lưu thành PDF”</b> (Save as PDF) trong hộp thoại in · khổ A4 · bật “Đồ hoạ nền” để giữ màu</span>
      {drafts > 0 && <span style={{ background: '#e8a600', color: '#222', padding: '2px 8px', borderRadius: 6, fontWeight: 600 }}>Có {drafts} bài đang là Nháp</span>}
      <button onClick={() => window.print()} style={{ padding: '5px 12px', borderRadius: 8, border: 0, background: '#00a693', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>In / Lưu PDF</button>
      <button onClick={() => window.close()} style={{ padding: '5px 12px', borderRadius: 8, border: '1px solid #555', background: 'transparent', color: '#fff', cursor: 'pointer' }}>Đóng</button>
    </div>
  );
}
