'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/client';
import { xinChoLuuTep, ghiNhanTep } from '@/app/actions';
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

export function UploadPanel({ groups }: { groups: { id: string; ten_nhom: string; ma_he_thong: string }[] }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [groupId, setGroupId] = useState('');
  const [ky, setKy] = useState(kyMacDinh());
  const [kind, setKind] = useState<FileKind>('bang_ke');
  const [guiNgay, setGuiNgay] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [keo, setKeo] = useState(false);
  const [tienDo, setTienDo] = useState<string | null>(null);
  const [ketQua, setKetQua] = useState('');
  const [loi, setLoi] = useState('');

  const nhom = groups.find((g) => g.id === groupId);

  function nhanTep(f: File | undefined) {
    setLoi(''); setKetQua('');
    if (!f) return;

    const duoi = '.' + (f.name.split('.').pop() ?? '').toLowerCase();
    if (!DUOI_HOP_LE.includes(duoi)) {
      setLoi(`Định dạng ${duoi} không nhận. Chỉ nhận ${DUOI_HOP_LE.join(', ')}.`);
      return;
    }
    if (f.size > GIOI_HAN) {
      setLoi(`Tệp nặng ${(f.size / 1048576).toFixed(1)} MB, vượt giới hạn 50 MB.`);
      return;
    }
    setFile(f);
  }

  async function taiLen() {
    if (!file || !groupId) return;
    setLoi(''); setKetQua('');

    try {
      setTienDo('Đang chuẩn bị…');
      const cho = await xinChoLuuTep(groupId, ky, kind, file.name);

      setTienDo('Đang tải tệp lên…');
      const { error } = await supabaseBrowser()
        .storage.from('bang-ke')
        .upload(cho.path, file, { contentType: file.type || undefined, upsert: false });

      if (error) throw new Error(error.message);

      setTienDo(guiNgay ? 'Đang gửi cho khách…' : 'Đang lưu…');
      const { ketQua: kq } = await ghiNhanTep({
        groupId, ky, kind,
        version: cho.version,
        storagePath: cho.path,
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        sizeBytes: file.size,
        guiNgay,
      });

      setKetQua(kq);
      setFile(null);
      if (inputRef.current) inputRef.current.value = '';
      router.refresh();
    } catch (e) {
      setLoi(e instanceof Error ? e.message : 'Tải lên thất bại.');
    } finally {
      setTienDo(null);
    }
  }

  const sanSang = Boolean(file && groupId && !tienDo);

  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-3 border-b border-[var(--line)]">
        <h2 className="text-sm font-bold m-0">Tải tệp lên</h2>
        <p className="text-xs text-[var(--ink-3)] mt-0.5 mb-0">
          Chọn nhóm và kỳ, hệ thống tự đánh số phiên bản. Tên tệp đặt thế nào cũng được.
        </p>
      </div>

      <div className="p-4 space-y-4">
        <div className="grid sm:grid-cols-3 gap-3">
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
            <select id="up-loai" className="field" value={kind}
                    onChange={(e) => setKind(e.target.value as FileKind)}>
              <option value="bang_ke">Bảng kê</option>
              <option value="hstt">Hồ sơ thanh toán</option>
            </select>
          </div>
        </div>

        {/* --- Vùng kéo thả --- */}
        <div
          onDragOver={(e) => { e.preventDefault(); setKeo(true); }}
          onDragLeave={() => setKeo(false)}
          onDrop={(e) => { e.preventDefault(); setKeo(false); nhanTep(e.dataTransfer.files[0]); }}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click(); }}
          role="button"
          tabIndex={0}
          className="border-2 border-dashed rounded-lg px-4 py-8 text-center cursor-pointer transition-colors"
          style={{
            borderColor: keo ? 'var(--accent)' : 'var(--line)',
            background: keo ? 'var(--accent-soft)' : 'transparent',
          }}
        >
          {file ? (
            <>
              <p className="text-sm font-semibold m-0">{file.name}</p>
              <p className="text-xs text-[var(--ink-3)] mt-1 mb-0 tnum">
                {(file.size / 1048576).toFixed(2)} MB · bấm để chọn tệp khác
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold m-0">Kéo tệp vào đây hoặc bấm để chọn</p>
              <p className="text-xs text-[var(--ink-3)] mt-1 mb-0">
                {DUOI_HOP_LE.join(' · ')} — tối đa 50 MB
              </p>
            </>
          )}
          <input ref={inputRef} type="file" className="hidden"
                 accept={DUOI_HOP_LE.join(',')}
                 onChange={(e) => nhanTep(e.target.files?.[0])} />
        </div>

        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={guiNgay} className="mt-0.5"
                 onChange={(e) => setGuiNgay(e.target.checked)} />
          <span>
            Gửi cho khách ngay sau khi tải lên
            <span className="block text-xs text-[var(--ink-3)]">
              Bỏ chọn nếu muốn kiểm tra lại trước. Tệp sẽ nằm ở mục chờ gửi.
            </span>
          </span>
        </label>

        {nhom && (
          <p className="text-xs text-[var(--ink-3)] m-0">
            Sẽ lưu vào <span className="mono">{nhom.ma_he_thong}/{ky}/</span>
          </p>
        )}

        {loi && (
          <p role="alert" className="text-sm text-[var(--critical)] bg-[var(--critical-soft)] px-3 py-2 rounded-[var(--r-sm)] m-0">
            {loi}
          </p>
        )}
        {ketQua && (
          <p className="text-sm text-[var(--accent-deep)] bg-[var(--accent-soft)] px-3 py-2 rounded-[var(--r-sm)] m-0">
            {ketQua}
          </p>
        )}

        <button className="btn btn-primary" onClick={taiLen} disabled={!sanSang}>
          {tienDo ?? (guiNgay ? 'Tải lên và gửi cho khách' : 'Tải lên')}
        </button>
      </div>
    </div>
  );
}
