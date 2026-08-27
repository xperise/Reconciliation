'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/client';
import { xinChoLuuTep, ghiNhanTep, kiemTraDaGui } from '@/app/actions';
import { FileKind } from '@/lib/types';

const DUOI_HOP_LE = ['.xlsx', '.xls', '.docx', '.doc', '.pdf', '.zip'];
const GIOI_HAN = 50 * 1024 * 1024;

/** Kỳ mặc định là tháng liền trước — bảng kê gửi tháng này là của tháng trước. */
function kyMacDinh(): string {
  const now = new Date();
  const m = now.getMonth() === 0 ? 12 : now.getMonth();
  const y = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  return `T${String(m).padStart(2, '0')}.${y}`;
}

type Hang = {
  id: string;
  file: File;
  trangThai: 'cho' | 'dang' | 'xong' | 'loi';
  ketQua?: string;
};

/**
 * Ba lựa chọn người dùng nhìn thấy, nhưng chỉ hai giá trị lưu xuống database.
 * "Bảng kê" và "Bảng kê chỉnh sửa" cùng là kind 'bang_ke', khác nhau ở số bản
 * mà hệ thống tự tăng. Tách ra ở đây vì với kế toán đó là hai việc khác nhau:
 * một cái gửi lần đầu, một cái gửi sau khi khách yêu cầu sửa.
 */
type LoaiChon = 'bang_ke' | 'bang_ke_sua' | 'hstt';

const LOAI: { v: LoaiChon; nhan: string; mo_ta: string }[] = [
  { v: 'bang_ke', nhan: 'Bảng kê', mo_ta: 'Bản gửi lần đầu của kỳ' },
  { v: 'bang_ke_sua', nhan: 'Bảng kê chỉnh sửa', mo_ta: 'Bản sửa sau khi khách có ý kiến' },
  { v: 'hstt', nhan: 'Hồ sơ thanh toán', mo_ta: 'Chứng từ gửi sau khi chốt bảng kê' },
];

export function UploadPanel({ groups, macDinhKind, tieuDe }: {
  groups: { id: string; ten_nhom: string; ma_he_thong: string }[];
  macDinhKind?: FileKind;
  tieuDe?: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [groupId, setGroupId] = useState('');
  const [ky, setKy] = useState(kyMacDinh());
  const [loai, setLoai] = useState<LoaiChon>(macDinhKind === 'hstt' ? 'hstt' : 'bang_ke');
  const kind: FileKind = loai === 'hstt' ? 'hstt' : 'bang_ke';
  const [guiNgay, setGuiNgay] = useState(true);
  const [hang, setHang] = useState<Hang[]>([]);
  const [keo, setKeo] = useState(false);
  const [dangChay, setDangChay] = useState(false);
  const [loi, setLoi] = useState('');

  // Hỏi lại khi loại tệp này đã từng gửi cho khách
  const [hoiGuiLai, setHoiGuiLai] = useState<
    { ngay: string; tenTep: string; ban: number } | null>(null);
  const [chacChan, setChacChan] = useState(false);
  const [lyDo, setLyDo] = useState('');

  const nhom = groups.find((g) => g.id === groupId);

  function themTep(list: FileList | null) {
    setLoi('');
    if (!list) return;
    const moi: Hang[] = [];
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
      moi.push({ id: `${f.name}-${f.size}-${Math.random()}`, file: f, trangThai: 'cho' });
    }
    setHang((p) => [...p, ...moi]);
  }

  async function batDau() {
    if (!groupId || hang.length === 0) return;

    // Chỉ hỏi khi thực sự định gửi cho khách ngay
    if (guiNgay && !hoiGuiLai) {
      const kt = await kiemTraDaGui(groupId, ky, kind);
      if (kt.daGui) {
        setHoiGuiLai({ ngay: kt.ngay, tenTep: kt.tenTep, ban: kt.ban });
        return;
      }
    }
    await chay();
  }

  async function chay() {
    setDangChay(true);
    setLoi('');

    for (const h of hang) {
      if (h.trangThai === 'xong') continue;
      setHang((p) => p.map((x) => x.id === h.id ? { ...x, trangThai: 'dang' } : x));

      try {
        const cho = await xinChoLuuTep(groupId, ky, kind, h.file.name);

        const { error } = await supabaseBrowser()
          .storage.from('bang-ke')
          .upload(cho.path, h.file, { contentType: h.file.type || undefined, upsert: false });
        if (error) throw new Error(error.message);

        const { ketQua } = await ghiNhanTep({
          groupId, ky, kind,
          version: cho.version,
          storagePath: cho.path,
          fileName: h.file.name,
          mimeType: h.file.type || 'application/octet-stream',
          sizeBytes: h.file.size,
          guiNgay,
          chapNhanGuiLai: hoiGuiLai ? { lyDo: lyDo.trim() } : undefined,
        });

        setHang((p) => p.map((x) => x.id === h.id
          ? { ...x, trangThai: 'xong', ketQua } : x));
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Tải lên thất bại.';
        setHang((p) => p.map((x) => x.id === h.id
          ? { ...x, trangThai: 'loi', ketQua: msg } : x));
      }
    }

    setDangChay(false);
    setHoiGuiLai(null);
    setChacChan(false);
    setLyDo('');
    if (inputRef.current) inputRef.current.value = '';
    router.refresh();
  }

  const nhanLoai = LOAI.find((l) => l.v === loai)?.nhan ?? 'tệp';

  const cuPhap = nhom
    ? `${nhom.ma_he_thong}_${ky}${
        loai === 'hstt' ? '_HSTT' : loai === 'bang_ke_sua' ? '_v2' : ''}`
    : 'MÃ_Kỳ';

  const sanSang = groupId && hang.some((h) => h.trangThai !== 'xong') && !dangChay;
  const soXong = hang.filter((h) => h.trangThai === 'xong').length;

  return (
    <div className="card overflow-hidden">
      <div className="card-hd">
        <p className="eyebrow">Tải lên</p>
        <h2 className="card-title mt-0.5">{tieuDe ?? 'Tải tệp lên'}</h2>
        <p className="card-note m-0 mt-1">
          Chọn nhóm và kỳ, hệ thống tự đánh số bản. Kéo nhiều tệp cùng lúc cũng được.
        </p>
      </div>

      <div className="card-pad flex flex-col gap-4">
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(3, minmax(0,1fr))' }}>
          <div>
            <label className="label" htmlFor="up-nhom">Nhóm đối soát</label>
            <select id="up-nhom" className="field" value={groupId}
                    onChange={(e) => setGroupId(e.target.value)}>
              <option value="">Chọn nhóm</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>{g.ten_nhom} ({g.ma_he_thong})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="up-ky">Kỳ đối soát</label>
            <input id="up-ky" className="field mono" value={ky}
                   onChange={(e) => setKy(e.target.value.toUpperCase())} placeholder="T07.2026" />
          </div>
          <div>
            <label className="label" htmlFor="up-loai">Loại tệp</label>
            <select id="up-loai" className="field" value={loai}
                    onChange={(e) => setLoai(e.target.value as LoaiChon)}>
              {LOAI.map((l) => <option key={l.v} value={l.v}>{l.nhan}</option>)}
            </select>
            <p className="text-[11px] text-[var(--ink-3)] mt-1 mb-0 leading-snug">
              {LOAI.find((l) => l.v === loai)?.mo_ta}
            </p>
          </div>
        </div>

        {loai === 'bang_ke_sua' && (
          <div className="callout callout-high">
            Bản chỉnh sửa dùng khi khách đã xem bản trước và yêu cầu sửa. Hệ thống
            tự đánh số bản tiếp theo và đặt lại đồng hồ SLA của khách kể từ lúc gửi.
            Nếu kỳ này chưa từng gửi bản nào, hãy chọn <strong>Bảng kê</strong>.
          </div>
        )}

        {/* Nhắc cú pháp — hệ thống không bắt buộc, nhưng đặt tên thống nhất
            giúp tra cứu về sau và khớp với hồ sơ lưu ngoài hệ thống */}
        <div className="callout callout-accent">
          <strong>Gợi ý đặt tên tệp: </strong>
          <span className="mono">{cuPhap}.xlsx</span>
          <span className="block mt-1 opacity-80">
            Hệ thống không bắt buộc theo cú pháp này vì nhóm và kỳ bạn đã chọn ở trên.
            Đặt đúng chỉ để tiện đối chiếu với hồ sơ lưu ngoài. Bản chỉnh sửa lần sau
            hệ thống tự đánh số bản 2, bản 3.
          </span>
        </div>

        {/* Vùng kéo thả */}
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
            {DUOI_HOP_LE.join(' · ')} — tối đa 50 MB mỗi tệp, chọn được nhiều tệp
          </p>
          <input ref={inputRef} type="file" className="hidden" multiple
                 accept={DUOI_HOP_LE.join(',')}
                 onChange={(e) => themTep(e.target.files)} />
        </div>

        {/* Hàng đợi */}
        {hang.length > 0 && (
          <div className="card overflow-hidden">
            <table className="tbl">
              <thead>
                <tr><th>Tệp</th><th className="text-right">Dung lượng</th><th>Trạng thái</th><th></th></tr>
              </thead>
              <tbody>
                {hang.map((h) => (
                  <tr key={h.id}>
                    <td className="text-[12.5px] max-w-[280px] truncate" title={h.file.name}>
                      {h.file.name}
                    </td>
                    <td className="text-right mono text-[12px] text-[var(--ink-3)]">
                      {(h.file.size / 1048576).toFixed(2)} MB
                    </td>
                    <td>
                      <span className={`pill ${
                        h.trangThai === 'xong' ? 'pill-stable'
                          : h.trangThai === 'loi' ? 'pill-critical'
                          : h.trangThai === 'dang' ? 'pill-watch' : 'pill-neutral'}`}>
                        {h.trangThai === 'xong' ? 'Xong'
                          : h.trangThai === 'loi' ? 'Lỗi'
                          : h.trangThai === 'dang' ? 'Đang chạy' : 'Chờ'}
                      </span>
                      {h.ketQua && (
                        <span className="sub" style={h.trangThai === 'loi'
                          ? { color: 'var(--critical)' } : undefined}>{h.ketQua}</span>
                      )}
                    </td>
                    <td className="text-right">
                      {!dangChay && h.trangThai !== 'xong' && (
                        <button className="btn btn-sm"
                                onClick={() => setHang((p) => p.filter((x) => x.id !== h.id))}>
                          Bỏ
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <label className="flex items-start gap-2 text-[13px] cursor-pointer">
          <input type="checkbox" checked={guiNgay} className="mt-0.5"
                 onChange={(e) => setGuiNgay(e.target.checked)} />
          <span>
            Gửi cho khách ngay sau khi tải lên
            <span className="block text-[11.5px] text-[var(--ink-3)]">
              Bỏ chọn nếu muốn kiểm tra lại trước. Tệp sẽ nằm ở mục chờ gửi và
              bạn bấm Gửi trên từng dòng.
            </span>
          </span>
        </label>

        {loi && <p role="alert" className="callout callout-critical m-0">{loi}</p>}

        <div className="flex items-center gap-3">
          <button className="btn btn-primary" onClick={batDau} disabled={!sanSang}>
            {dangChay ? 'Đang xử lý…'
              : guiNgay
                ? `Tải lên và gửi ${hang.length > 1 ? `${hang.length} tệp` : ''}`
                : `Tải lên ${hang.length > 1 ? `${hang.length} tệp` : ''}`}
          </button>
          {soXong > 0 && !dangChay && (
            <button className="btn" onClick={() => setHang([])}>Xoá danh sách</button>
          )}
        </div>
      </div>

      {/* Hỏi lại khi đã gửi loại tệp này rồi */}
      {hoiGuiLai && (
        <div className="modal-scrim" onClick={(e) => {
          if (e.target === e.currentTarget) { setHoiGuiLai(null); setChacChan(false); setLyDo(''); }
        }}>
          <div className="modal-box" style={{ maxWidth: 520 }} role="dialog" aria-modal="true">
            <header className="modal-hd">
              <p className="eyebrow" style={{ color: 'var(--high)' }}>Xác nhận gửi lại</p>
              <h2 className="card-title mt-0.5">Khách này đã nhận rồi</h2>
            </header>
            <div className="modal-bd">
              <p className="callout callout-high m-0 mb-3">
                Bạn đã gửi {nhanLoai} cho <strong>{nhom?.ten_nhom}</strong> kỳ{' '}
                <strong>{ky}</strong> vào ngày{' '}
                <strong>{new Date(hoiGuiLai.ngay).toLocaleDateString('vi-VN')}</strong>
                {' '}(tệp {hoiGuiLai.tenTep}, bản {hoiGuiLai.ban}).
                Bạn có chắc chắn muốn gửi lại?
              </p>

              <label className="label" htmlFor="ly-do-gui-lai">Lý do gửi lại — bắt buộc</label>
              <textarea id="ly-do-gui-lai" className="field" rows={2} value={lyDo}
                        onChange={(e) => setLyDo(e.target.value)}
                        placeholder="Ví dụ: khách báo không nhận được, hoặc số liệu bản trước sai" />

              <label className="flex items-start gap-2 text-[13px] mt-3 cursor-pointer">
                <input type="checkbox" checked={chacChan} className="mt-0.5"
                       onChange={(e) => setChacChan(e.target.checked)} />
                <span>Tôi chắc chắn muốn gửi lại cho khách hàng này.</span>
              </label>

              <p className="text-[11.5px] text-[var(--ink-3)] mt-3 mb-0 leading-relaxed">
                Thao tác này được ghi vào Nhật ký và mục Theo dõi kỳ, kèm tên bạn và lý do.
              </p>
            </div>
            <footer className="modal-ft">
              <button className="btn" onClick={() => {
                setHoiGuiLai(null); setChacChan(false); setLyDo('');
              }}>Bỏ qua</button>
              <button className="btn btn-primary" disabled={!chacChan || !lyDo.trim()}
                      onClick={chay}>
                Xác nhận gửi lại
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}
