'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/client';
import { xinChoLuuTep, ghiNhanTep, kiemTraTruocKhiGui, guiLoNgay } from '@/app/actions';
import { FileKind } from '@/lib/types';

const DUOI_HOP_LE = ['.xlsx', '.xls', '.docx', '.doc', '.pdf', '.zip'];
const GIOI_HAN = 50 * 1024 * 1024;

type LoaiChon = 'bang_ke' | 'bang_ke_sua' | 'hstt';

const LOAI: { v: LoaiChon; nhan: string; mo_ta: string }[] = [
  { v: 'bang_ke', nhan: 'Bảng kê', mo_ta: 'Bản gửi lần đầu của kỳ' },
  { v: 'bang_ke_sua', nhan: 'Bảng kê chỉnh sửa', mo_ta: 'Bản sửa sau khi khách có ý kiến' },
  { v: 'hstt', nhan: 'Hồ sơ thanh toán', mo_ta: 'Chứng từ gửi sau khi chốt bảng kê' },
];

export type Nhom = {
  id: string; ten_nhom: string; ma_he_thong: string;
  dots?: { dot: number; nhan: string }[];
};

function kyMacDinh(): string {
  const now = new Date();
  const m = now.getMonth() === 0 ? 12 : now.getMonth();
  const y = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  return `T${String(m).padStart(2, '0')}.${y}`;
}

const THANG = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));

function namQuanhDay(): number[] {
  const nay = new Date().getFullYear();
  return [nay - 2, nay - 1, nay, nay + 1];
}

function tachKy(ky: string): { thang: string; nam: string } {
  const m = ky.match(/^T(\d{2})\.(\d{4})$/);
  return m
    ? { thang: m[1], nam: m[2] }
    : { thang: THANG[new Date().getMonth()], nam: String(new Date().getFullYear()) };
}

/**
 * Chọn kỳ bằng hai ô thả xuống thay vì gõ tay.
 *
 * Gõ tay dễ sai một ký tự mà không ai phát hiện cho tới khi khách nhận nhầm
 * bảng kê của kỳ khác. Ràng buộc bằng danh sách thì sai đó không xảy ra được.
 */
function ChonKy({ ky, onChange, nho }: {
  ky: string; onChange: (v: string) => void; nho?: boolean;
}) {
  const { thang, nam } = tachKy(ky);
  const cls = nho ? 'field !py-1 !text-[12px]' : 'field';
  return (
    <div className="flex gap-1.5">
      <select className={cls} value={thang} aria-label="Tháng"
              onChange={(e) => onChange(`T${e.target.value}.${nam}`)}>
        {THANG.map((t) => <option key={t} value={t}>Tháng {t}</option>)}
      </select>
      <select className={cls} value={nam} aria-label="Năm"
              onChange={(e) => onChange(`T${thang}.${e.target.value}`)}>
        {namQuanhDay().map((n) => <option key={n} value={n}>{n}</option>)}
      </select>
    </div>
  );
}

/** Đoán nhóm khách từ tên tệp bằng cách dò mã hệ thống trong đó. */
function doanNhom(tenTep: string, groups: Nhom[]): string {
  const t = tenTep.toUpperCase();
  const khop = groups
    .filter((g) => t.includes(g.ma_he_thong.toUpperCase()))
    .sort((a, b) => b.ma_he_thong.length - a.ma_he_thong.length);
  return khop[0]?.id ?? '';
}

/** Đoán kỳ từ tên tệp, chấp nhận T07.2026 hoặc T07-2026 hoặc 072026. */
function doanKy(tenTep: string): string | null {
  const m = tenTep.toUpperCase().match(/T?(\d{2})[.\-_]?(\d{4})/);
  if (!m) return null;
  const thang = Number(m[1]);
  if (thang < 1 || thang > 12) return null;
  return `T${m[1]}.${m[2]}`;
}

type Dong = {
  id: string;
  file: File;
  groupId: string;
  ky: string;
  loai: LoaiChon;
  dot: number;
  guiNgay: boolean;
  /** Nhiều dòng cùng khóa này sẽ gộp thành một lô, gửi chung một email. */
  trangThai: 'cho' | 'dang' | 'xong' | 'loi' | 'bo_qua';
  ketQua?: string;
};

export function UploadPanel({ groups, macDinhKind, tieuDe }: {
  groups: Nhom[];
  macDinhKind?: FileKind;
  tieuDe?: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [dong, setDong] = useState<Dong[]>([]);
  const [keo, setKeo] = useState(false);
  const [dangChay, setDangChay] = useState(false);
  const [loi, setLoi] = useState('');

  // Mặc định áp cho các tệp mới kéo vào
  const [mdGroup, setMdGroup] = useState('');
  const [mdKy, setMdKy] = useState(kyMacDinh());
  const [mdLoai, setMdLoai] = useState<LoaiChon>(macDinhKind === 'hstt' ? 'hstt' : 'bang_ke');
  const [mdGuiNgay, setMdGuiNgay] = useState(true);

  // Hộp thoại cảnh báo trước khi gửi
  const [canhBao, setCanhBao] = useState<{
    items: { loai: string; tieuDe: string; noiDung: string }[];
    nhan: string;
    chiDong?: string[];
  } | null>(null);
  const [chacChan, setChacChan] = useState(false);
  const [lyDo, setLyDo] = useState('');

  function themTep(list: FileList | null) {
    setLoi('');
    if (!list) return;
    const moi: Dong[] = [];
    for (const f of Array.from(list)) {
      const duoi = '.' + (f.name.split('.').pop() ?? '').toLowerCase();
      if (!DUOI_HOP_LE.includes(duoi)) {
        setLoi(`Bỏ qua "${f.name}" — định dạng ${duoi} không nhận.`);
        continue;
      }
      if (f.size > GIOI_HAN) {
        setLoi(`Bỏ qua "${f.name}" — nặng ${(f.size / 1048576).toFixed(1)} MB, vượt 50 MB.`);
        continue;
      }
      moi.push({
        id: `${f.name}-${f.size}-${Math.random()}`,
        file: f,
        groupId: mdGroup || doanNhom(f.name, groups),
        ky: doanKy(f.name) ?? mdKy,
        loai: mdLoai,
        dot: 1,
        guiNgay: mdGuiNgay,
        trangThai: 'cho',
      });
    }
    setDong((p) => [...p, ...moi]);
  }

  const sua = (id: string, patch: Partial<Dong>) =>
    setDong((p) => p.map((d) => d.id === id ? { ...d, ...patch } : d));

  const apDungTatCa = (patch: Partial<Dong>) =>
    setDong((p) => p.map((d) => d.trangThai === 'cho' ? { ...d, ...patch } : d));

  /** Khóa gom lô: cùng khách, cùng kỳ, cùng đợt, cùng loại thì chung một email. */
  const khoaLo = (d: Dong) =>
    `${d.groupId}|${d.ky}|${d.dot}|${d.loai === 'hstt' ? 'hstt' : 'bang_ke'}`;

  async function batDau(chiDong?: string[]) {
    const canXuLy = dong.filter((d) =>
      d.trangThai === 'cho' && d.groupId
      && (!chiDong || chiDong.includes(d.id)));

    if (canXuLy.length === 0) {
      setLoi('Chưa dòng nào đủ thông tin. Mỗi tệp phải chọn khách hàng.');
      return;
    }

    // Chỉ hỏi khi thực sự định gửi ngay
    const guiNgay = canXuLy.filter((d) => d.guiNgay);
    if (guiNgay.length > 0 && !canhBao) {
      const daHoi = new Set<string>();
      const gom: { loai: string; tieuDe: string; noiDung: string }[] = [];
      const ten: string[] = [];

      for (const d of guiNgay) {
        const k = khoaLo(d);
        if (daHoi.has(k)) continue;
        daHoi.add(k);
        const kq = await kiemTraTruocKhiGui(
          d.groupId, d.ky, d.loai === 'hstt' ? 'hstt' : 'bang_ke', d.dot);
        if (kq.coCanhBao) {
          const g = groups.find((x) => x.id === d.groupId);
          ten.push(`${g?.ten_nhom ?? ''} ${d.ky}`);
          gom.push(...kq.canhBao);
        }
      }

      if (gom.length > 0) {
        setCanhBao({ items: gom, nhan: ten.join(', '), chiDong });
        return;
      }
    }

    await chay(chiDong);
  }

  async function chay(chiDong?: string[]) {
    setDangChay(true);
    setLoi('');
    setCanhBao(null);

    const canXuLy = dong.filter((d) =>
      d.trangThai === 'cho' && d.groupId
      && (!chiDong || chiDong.includes(d.id)));

    // Gom thành lô trước, để các tệp cùng một bảng kê chung số bản
    const lo = new Map<string, Dong[]>();
    for (const d of canXuLy) {
      const k = khoaLo(d);
      const arr = lo.get(k) ?? [];
      arr.push(d);
      lo.set(k, arr);
    }

    for (const [, ds] of lo) {
      const batchId = crypto.randomUUID();
      const kind: FileKind = ds[0].loai === 'hstt' ? 'hstt' : 'bang_ke';
      let banChung: number | undefined;

      for (const d of ds) {
        sua(d.id, { trangThai: 'dang' });
        try {
          const cho = await xinChoLuuTep(d.groupId, d.ky, kind, d.file.name, d.dot, banChung);
          banChung = cho.version;

          const { error } = await supabaseBrowser()
            .storage.from('bang-ke')
            .upload(cho.path, d.file, { contentType: d.file.type || undefined, upsert: false });
          if (error) throw new Error(error.message);

          await ghiNhanTep({
            groupId: d.groupId, ky: d.ky, kind, dot: d.dot,
            batchId,
            version: cho.version,
            storagePath: cho.path,
            fileName: d.file.name,
            mimeType: d.file.type || 'application/octet-stream',
            sizeBytes: d.file.size,
            guiNgay: false,   // gửi cả lô một lần ở dưới, không gửi từng tệp
          });

          sua(d.id, { trangThai: 'xong', ketQua: `Đã lưu, bản ${cho.version}` });
        } catch (e) {
          sua(d.id, {
            trangThai: 'loi',
            ketQua: e instanceof Error ? e.message : 'Tải lên thất bại.',
          });
        }
      }

      // Gửi cả lô trong một email
      if (ds[0].guiNgay) {
        try {
          const r = await guiLoNgay(batchId, canhBao ? { lyDo: lyDo.trim() } : undefined);
          for (const d of ds) {
            if (d.trangThai !== 'loi') sua(d.id, { ketQua: r.message });
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'Gửi thất bại.';
          for (const d of ds) sua(d.id, { ketQua: `Đã lưu nhưng chưa gửi: ${msg}` });
        }
      }
    }

    setDangChay(false);
    setChacChan(false);
    setLyDo('');
    if (inputRef.current) inputRef.current.value = '';
    router.refresh();
  }

  const soCho = dong.filter((d) => d.trangThai === 'cho').length;
  const soThieuNhom = dong.filter((d) => d.trangThai === 'cho' && !d.groupId).length;
  // Cho phép chạy khi ít nhất một dòng đủ thông tin, thay vì bắt mọi dòng
  // phải xong. Dòng thiếu khách hàng sẽ tự bị bỏ qua.
  const soSanSang = dong.filter((d) => d.trangThai === 'cho' && d.groupId).length;
  const sanSang = soSanSang > 0 && !dangChay;

  // Xem trước cách gom lô, để người dùng biết tệp nào đi chung email nào
  const xemLo = new Map<string, Dong[]>();
  for (const d of dong.filter((x) => x.trangThai === 'cho' && x.groupId)) {
    const k = khoaLo(d);
    xemLo.set(k, [...(xemLo.get(k) ?? []), d]);
  }
  const loNhieuTep = [...xemLo.values()].filter((v) => v.length > 1);

  return (
    <div className="card overflow-hidden">
      <div className="card-hd">
        <p className="eyebrow">Tải lên</p>
        <h2 className="card-title mt-0.5">{tieuDe ?? 'Tải tệp lên'}</h2>
        <p className="card-note m-0 mt-1">
          Kéo nhiều tệp của nhiều khách vào cùng lúc. Hệ thống đoán nhóm và kỳ từ
          tên tệp, bạn chỉ sửa dòng nào đoán sai.
        </p>
      </div>

      <div className="card-pad flex flex-col gap-4">
        {/* Giá trị mặc định cho tệp kéo vào sau */}
        <div>
          <p className="label !mb-2">Mặc định áp cho tệp mới kéo vào</p>
          <div className="grid gap-3 items-end"
               style={{ gridTemplateColumns: 'minmax(0,1.4fr) minmax(0,1.4fr) minmax(0,1fr) auto' }}>
            <select className="field" value={mdGroup} onChange={(e) => setMdGroup(e.target.value)}
                    aria-label="Khách hàng mặc định">
              <option value="">Chọn khách hàng</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>{g.ten_nhom} ({g.ma_he_thong})</option>
              ))}
            </select>
            <ChonKy ky={mdKy} onChange={setMdKy} />
            <select className="field" value={mdLoai} aria-label="Loại mặc định"
                    onChange={(e) => setMdLoai(e.target.value as LoaiChon)}>
              {LOAI.map((l) => <option key={l.v} value={l.v}>{l.nhan}</option>)}
            </select>
            <label className="flex items-center gap-2 text-[12.5px] cursor-pointer">
              <input type="checkbox" checked={mdGuiNgay}
                     onChange={(e) => setMdGuiNgay(e.target.checked)} />
              Gửi ngay
            </label>
          </div>
        </div>

        <div
          onDragOver={(e) => { e.preventDefault(); setKeo(true); }}
          onDragLeave={() => setKeo(false)}
          onDrop={(e) => { e.preventDefault(); setKeo(false); themTep(e.dataTransfer.files); }}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click(); }}
          role="button" tabIndex={0}
          className="drop-zone" data-on={keo}
        >
          <p className="text-[13px] font-semibold m-0">Kéo tệp vào đây hoặc bấm để chọn</p>
          <p className="text-[11.5px] text-[var(--ink-3)] mt-1 mb-0">
            {DUOI_HOP_LE.join(' · ')} — tối đa 50 MB mỗi tệp, chọn được nhiều tệp của nhiều khách
          </p>
          <input ref={inputRef} type="file" className="hidden" multiple
                 accept={DUOI_HOP_LE.join(',')}
                 onChange={(e) => themTep(e.target.files)} />
        </div>

        {loNhieuTep.length > 0 && (
          <div className="callout callout-accent">
            <strong>Gộp thành một email: </strong>
            {loNhieuTep.map((v, i) => {
              const g = groups.find((x) => x.id === v[0].groupId);
              return (
                <span key={i}>
                  {i > 0 && ' · '}
                  {g?.ten_nhom} {v[0].ky} — {v.length} tệp
                </span>
              );
            })}
            <span className="block mt-1 opacity-80">
              Các tệp cùng khách, cùng kỳ, cùng loại sẽ đính kèm chung một thư
              và mang cùng số bản.
            </span>
          </div>
        )}

        {dong.length > 0 && (
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Tệp</th><th style={{ minWidth: 190 }}>Khách hàng</th>
                    <th style={{ width: 190 }}>Kỳ bảng kê</th>
                    <th style={{ width: 160 }}>Loại</th>
                    <th style={{ width: 78 }}>Gửi ngay</th>
                    <th>Trạng thái</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {dong.map((d) => (
                    <tr key={d.id}>
                      <td className="text-[12.5px] max-w-[220px] truncate" title={d.file.name}>
                        {d.file.name}
                        <span className="sub mono">{(d.file.size / 1048576).toFixed(2)} MB</span>
                      </td>
                      <td>
                        <select className="field !py-1 !text-[12px]" value={d.groupId}
                                disabled={d.trangThai !== 'cho'}
                                onChange={(e) => sua(d.id, { groupId: e.target.value })}
                                style={!d.groupId ? { borderColor: 'var(--critical)' } : undefined}>
                          <option value="">Chọn khách</option>
                          {groups.map((g) => (
                            <option key={g.id} value={g.id}>{g.ten_nhom} ({g.ma_he_thong})</option>
                          ))}
                        </select>
                      </td>
                      <td>
                        {d.trangThai === 'cho'
                          ? <ChonKy nho ky={d.ky} onChange={(v) => sua(d.id, { ky: v })} />
                          : <span className="mono text-[12px]">{d.ky}</span>}
                      </td>
                      <td>
                        <select className="field !py-1 !text-[12px]" value={d.loai}
                                disabled={d.trangThai !== 'cho'}
                                onChange={(e) => sua(d.id, { loai: e.target.value as LoaiChon })}>
                          {LOAI.map((l) => <option key={l.v} value={l.v}>{l.nhan}</option>)}
                        </select>
                      </td>
                      <td className="text-center">
                        <input type="checkbox" checked={d.guiNgay}
                               disabled={d.trangThai !== 'cho'}
                               onChange={(e) => sua(d.id, { guiNgay: e.target.checked })} />
                      </td>
                      <td>
                        <span className={`pill ${
                          d.trangThai === 'xong' ? 'pill-stable'
                            : d.trangThai === 'loi' ? 'pill-critical'
                            : d.trangThai === 'dang' ? 'pill-watch' : 'pill-neutral'}`}>
                          {d.trangThai === 'xong' ? 'Xong'
                            : d.trangThai === 'loi' ? 'Lỗi'
                            : d.trangThai === 'dang' ? 'Đang chạy' : 'Chờ'}
                        </span>
                        {d.ketQua && (
                          <span className="sub" style={d.trangThai === 'loi'
                            ? { color: 'var(--critical)' } : undefined}>{d.ketQua}</span>
                        )}
                      </td>
                      <td className="text-right">
                        {!dangChay && d.trangThai === 'cho' && (
                          <div className="flex gap-1.5 justify-end">
                            <button className="btn btn-sm btn-primary" disabled={!d.groupId}
                                    title="Chỉ xử lý riêng tệp này"
                                    onClick={() => batDau([d.id])}>
                              Xử lý
                            </button>
                            <button className="btn btn-sm"
                                    onClick={() => setDong((p) => p.filter((x) => x.id !== d.id))}>
                              Bỏ
                            </button>
                          </div>
                        )}
                        {!dangChay && d.trangThai === 'loi' && (
                          <button className="btn btn-sm"
                                  onClick={() => sua(d.id, { trangThai: 'cho', ketQua: undefined })}>
                            Thử lại
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {soCho > 0 && (
              <div className="card-pad !py-2.5 flex flex-wrap items-center gap-2"
                   style={{ borderTop: '1px solid var(--line)' }}>
                <span className="text-[11.5px] text-[var(--ink-3)]">Áp cho mọi dòng đang chờ:</span>
                <button className="btn btn-sm" onClick={() => apDungTatCa({ guiNgay: true })}>
                  Gửi ngay tất cả
                </button>
                <button className="btn btn-sm" onClick={() => apDungTatCa({ guiNgay: false })}>
                  Để workflow gửi
                </button>
                {mdGroup && (
                  <button className="btn btn-sm" onClick={() => apDungTatCa({ groupId: mdGroup })}>
                    Gán về khách mặc định
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {soThieuNhom > 0 && (
          <p className="callout callout-high m-0">
            Còn {soThieuNhom} tệp chưa chọn khách hàng. Hệ thống không tìm thấy mã
            hệ thống nào trong tên tệp, hãy chọn ở cột Khách hàng. Có thể bấm
            <strong> Xử lý</strong> trên từng dòng đã đủ thông tin mà không cần đợi các dòng còn lại.
          </p>
        )}

        {loi && <p role="alert" className="callout callout-critical m-0">{loi}</p>}

        <div className="flex items-center gap-3">
          <button className="btn btn-primary" onClick={() => batDau()} disabled={!sanSang}>
            {dangChay ? 'Đang xử lý…' : `Xử lý tất cả ${soSanSang} tệp`}
          </button>
          {dong.some((d) => d.trangThai === 'xong') && !dangChay && (
            <button className="btn" onClick={() => setDong([])}>Xoá danh sách</button>
          )}
        </div>
      </div>

      {/* Cảnh báo trước khi gửi */}
      {canhBao && (
        <div className="modal-scrim" onClick={(e) => {
          if (e.target === e.currentTarget) { setCanhBao(null); setChacChan(false); setLyDo(''); }
        }}>
          <div className="modal-box" style={{ maxWidth: 560 }} role="dialog" aria-modal="true">
            <header className="modal-hd">
              <p className="eyebrow" style={{ color: 'var(--high)' }}>Cần bạn xác nhận</p>
              <h2 className="card-title mt-0.5">Trước khi gửi cho khách</h2>
              <p className="card-note m-0 mt-1">{canhBao.nhan}</p>
            </header>
            <div className="modal-bd">
              <div className="flex flex-col gap-2.5 mb-3">
                {canhBao.items.map((c, i) => (
                  <div key={i} className="callout callout-high">
                    <strong className="block mb-1">{c.tieuDe}</strong>
                    {c.noiDung}
                  </div>
                ))}
              </div>

              <label className="label" htmlFor="ld-canh-bao">Lý do — bắt buộc</label>
              <textarea id="ld-canh-bao" className="field" rows={2} value={lyDo}
                        onChange={(e) => setLyDo(e.target.value)}
                        placeholder="Ví dụ: khách phát hiện sai số liệu sau khi đã chốt" />

              <label className="flex items-start gap-2 text-[13px] mt-3 cursor-pointer">
                <input type="checkbox" checked={chacChan} className="mt-0.5"
                       onChange={(e) => setChacChan(e.target.checked)} />
                <span>Tôi chắc chắn muốn gửi cho khách hàng này.</span>
              </label>

              <p className="text-[11.5px] text-[var(--ink-3)] mt-3 mb-0 leading-relaxed">
                Thao tác được ghi vào Nhật ký và mục Theo dõi kỳ, kèm tên bạn và lý do.
              </p>
            </div>
            <footer className="modal-ft">
              <button className="btn" onClick={() => {
                setCanhBao(null); setChacChan(false); setLyDo('');
              }}>Bỏ qua</button>
              <button className="btn btn-primary" disabled={!chacChan || !lyDo.trim()}
                      onClick={() => chay(canhBao.chiDong)}>
                Xác nhận và gửi
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}
