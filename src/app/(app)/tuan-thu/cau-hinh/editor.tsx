'use client';
import { useState } from 'react';
import { luuCauHinh, type BuocNhap, type RoleNhap } from './cau-hinh-actions';
import type { KetQuaBuoc } from '@/lib/tuan-thu/cau-hinh';

const KQ_NHAN: Record<KetQuaBuoc, string> = { duyet: 'Duyệt', tra_ve: 'Trả về', chan: 'Chặn' };

type BuocDong = { key: string; nhom: number; roleKey: string; che_do: 'any' | 'all' | 'quorum'; ketQua: KetQuaBuoc[]; nguoi?: string | null };
const CHE_DO_NHAN: Record<BuocDong['che_do'], string> = { any: 'Một người bất kỳ', all: 'Tất cả thành viên', quorum: 'Đa số thành viên' };

export function CauHinhEditor({ roles: r0, buoc: b0, thanhVien }: { roles: { key: string; ten: string; kichHoat: boolean }[]; buoc: { key: string; thuTu: number; roleKey: string; mode?: string; nhom?: number; nguoi?: string | null; ketQua: KetQuaBuoc[] }[]; thanhVien: { id: string; role: string; ten: string }[] }) {
  const [roles, setRoles] = useState<RoleNhap[]>(r0.map((r) => ({ key: r.key, ten: r.ten, kichHoat: r.kichHoat })));
  const [buoc, setBuoc] = useState<BuocDong[]>(b0.map((b) => ({ key: b.key, nhom: b.nhom ?? b.thuTu, roleKey: b.roleKey, che_do: (b.mode as BuocDong['che_do']) ?? 'any', ketQua: b.ketQua, nguoi: b.nguoi ?? null })));
  const [tenMoi, setTenMoi] = useState('');
  const [loi, setLoi] = useState<string[]>([]);
  const [ok, setOk] = useState('');
  const [dang, setDang] = useState(false);

  const sua = (fn: () => void) => { setOk(''); setLoi([]); fn(); };
  const themRole = () => { const t = tenMoi.trim(); if (!t) return; sua(() => { setRoles([...roles, { key: t, ten: t, kichHoat: false }]); setTenMoi(''); }); };
  const themBuoc = () => sua(() => setBuoc([...buoc, { key: `buoc_${buoc.length + 1}`, nhom: (Math.max(0, ...buoc.map((b) => b.nhom)) || 0) + 1, roleKey: roles[0]?.key ?? '', che_do: 'any', ketQua: ['duyet'] }]));
  const boKq = (i: number, kq: KetQuaBuoc) => sua(() => setBuoc(buoc.map((b, j) => j !== i ? b : { ...b, ketQua: b.ketQua.includes(kq) ? b.ketQua.filter((x) => x !== kq) : [...b.ketQua, kq] })));

  return (
    <div className="space-y-6">
      <section className="card card-pad">
        <h2 className="card-title mb-2">Phòng ban và role</h2>
        <table className="tbl text-[13px]"><thead><tr><th>Mã</th><th>Tên hiển thị</th><th>Được kích hoạt hợp đồng</th><th></th></tr></thead>
          <tbody>{roles.map((r, i) => (
            <tr key={r.key + i}>
              <td><code>{r.key}</code></td>
              <td><input className="field !py-1" value={r.ten} onChange={(e) => sua(() => setRoles(roles.map((x, j) => j === i ? { ...x, ten: e.target.value } : x)))} /></td>
              <td><input type="checkbox" checked={r.kichHoat} onChange={(e) => sua(() => setRoles(roles.map((x, j) => j === i ? { ...x, kichHoat: e.target.checked } : x)))} /></td>
              <td><button className="text-[12px] underline" onClick={() => sua(() => setRoles(roles.filter((_, j) => j !== i)))}>Xoá</button></td>
            </tr>))}</tbody></table>
        <div className="mt-3 flex gap-2">
          <input className="field !py-1" placeholder="Tên phòng ban mới" value={tenMoi} onChange={(e) => setTenMoi(e.target.value)} />
          <button className="btn btn-sm" onClick={themRole}>+ Thêm role</button>
        </div>
      </section>

      <section className="card card-pad">
        <h2 className="card-title mb-2">Chuỗi bước duyệt</h2>
        <p className="text-[12px] text-[var(--ink-2)] mb-2">Nhóm có số nhỏ hơn duyệt trước. Các bước cùng nhóm chạy song song và nhóm xong khi mọi bước duyệt trong nhóm đã đủ. Bước kiểm soát chỉ có Chặn hoặc Trả về, không có Duyệt.</p>
        <table className="tbl text-[13px]"><thead><tr><th>Mã bước</th><th>Nhóm</th><th>Role</th><th>Ai duyệt trong bước</th><th>Kết quả được phép</th><th></th></tr></thead>
          <tbody>{buoc.map((b, i) => (
            <tr key={i}>
              <td><input className="field !py-1" value={b.key} onChange={(e) => sua(() => setBuoc(buoc.map((x, j) => j === i ? { ...x, key: e.target.value } : x)))} /></td>
              <td><input type="number" min={1} className="field !py-1 w-20" value={b.nhom} onChange={(e) => sua(() => setBuoc(buoc.map((x, j) => j === i ? { ...x, nhom: Number(e.target.value) } : x)))} /></td>
              <td><select className="field !py-1" value={b.roleKey} onChange={(e) => sua(() => setBuoc(buoc.map((x, j) => j === i ? { ...x, roleKey: e.target.value, nguoi: null } : x)))}>
                {roles.map((r) => <option key={r.key} value={r.key}>{r.ten || r.key}</option>)}</select></td>
              <td><select className="field !py-1" value={b.nguoi ? `nguoi:${b.nguoi}` : `mode:${b.che_do}`}
                onChange={(e) => sua(() => setBuoc(buoc.map((x, j) => {
                  if (j !== i) return x;
                  const v = e.target.value;
                  return v.startsWith('nguoi:') ? { ...x, nguoi: v.slice(6), che_do: 'any' } : { ...x, nguoi: null, che_do: v.slice(5) as BuocDong['che_do'] };
                })))}>
                <optgroup label="Theo role">{(Object.keys(CHE_DO_NHAN) as BuocDong['che_do'][]).map((k) => <option key={k} value={`mode:${k}`}>{CHE_DO_NHAN[k]} của role</option>)}</optgroup>
                {thanhVien.filter((t) => t.role === b.roleKey).length > 0 && (
                  <optgroup label="Người cụ thể (thành viên đã gán)">{thanhVien.filter((t) => t.role === b.roleKey).map((t) => <option key={t.id} value={`nguoi:${t.id}`}>{t.ten}</option>)}</optgroup>
                )}
              </select></td>
              <td>{(['duyet', 'tra_ve', 'chan'] as KetQuaBuoc[]).map((kq) => (
                <label key={kq} className="mr-3 text-[12px]"><input type="checkbox" checked={b.ketQua.includes(kq)} onChange={() => boKq(i, kq)} /> {KQ_NHAN[kq]}</label>))}</td>
              <td><button className="text-[12px] underline" onClick={() => sua(() => setBuoc(buoc.filter((_, j) => j !== i)))}>Xoá</button></td>
            </tr>))}</tbody></table>
        <button className="btn btn-sm mt-3" onClick={themBuoc}>+ Thêm bước</button>
      </section>

      <div className="flex items-center gap-3">
        <button className="btn btn-primary" disabled={dang} onClick={async () => {
          setDang(true); setOk(''); setLoi([]);
          const kq = await luuCauHinh({ roles, buoc });
          setDang(false);
          if (kq.ok) setOk(kq.thongBao ?? 'Đã lưu.'); else setLoi(kq.loi);
        }}>Kiểm tra và lưu</button>
        {ok && <span className="text-[13px]">{ok}</span>}
      </div>
      {loi.length > 0 && <ul className="text-[13px] text-[var(--red)] list-disc pl-5">{loi.map((x, i) => <li key={i}>{x}</li>)}</ul>}
    </div>
  );
}
