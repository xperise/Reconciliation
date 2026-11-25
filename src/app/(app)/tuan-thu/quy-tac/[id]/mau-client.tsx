'use client';
import { useState } from 'react';
import { FormHanhDong, Nut } from '../../ui';
import { duyetMauBangKe, hocMauBangKe, suaGhepCotMau } from '../../actions';
import { taiLenTrucTiep } from '../../tai-len';

async function hocQuaStorage(fd: FormData) {
  try { await taiLenTrucTiep(fd, 'mau', 'mau_json', 'raw', String(fd.get('ma_khach') ?? 'mau')); }
  catch (e) { return { ok: false as const, loi: e instanceof Error ? e.message : String(e) }; }
  return hocMauBangKe(fd);
}

export function HocMau({ maKhach }: { maKhach: string }) {
  return (
    <FormHanhDong action={hocQuaStorage} nhanNut="Học mẫu từ file này" kieu="">
      <input type="hidden" name="ma_khach" value={maKhach} />
      <label className="text-[12px] flex flex-col gap-1 max-w-md">Bảng kê mẫu đã gửi khách (.xlsx)<input type="file" name="mau" accept=".xlsx" required className="text-[12px]" /></label>
    </FormHanhDong>
  );
}

export function GhepCot({ id, sheet, so, nguon, luaChon, congThuc }: { id: string; sheet: string; so: number; nguon: string; luaChon: string[]; congThuc?: string }) {
  const [v, setV] = useState(nguon);
  return (
    <span className="inline-flex gap-1 items-start">
      <select className="field !py-1 text-[12px]" value={v} onChange={(e) => setV(e.target.value)}>
        <option value="">— Để trống —</option><option value="#">Số thứ tự</option><option value="@trang_thai">Trạng thái (tên hiển thị)</option>
        {congThuc && <option value="@cong_thuc">Giữ công thức của mẫu (={congThuc})</option>}
        {luaChon.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
      {v !== nguon && <Nut chay={() => suaGhepCotMau(id, sheet, so, v)} nhan="Lưu" kieu="btn-primary" />}
    </span>
  );
}

export function DuyetMau({ id }: { id: string }) {
  return <Nut chay={() => duyetMauBangKe(id)} nhan="Duyệt mẫu — dùng cho các lần chạy từ raw" kieu="btn-primary" xacNhan="Duyệt mẫu này? Các lần chạy từ raw tiếp theo của khách sẽ dựng theo mẫu." />;
}
