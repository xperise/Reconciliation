'use client';

import { useState, useRef, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/client';
import { xinChoLuuTep, ghiNhanTep, traLoiKhach } from '@/app/actions';

const DUOI_HOP_LE = ['.xlsx', '.xls', '.docx', '.doc', '.pdf', '.zip', '.png', '.jpg'];
const GIOI_HAN = 25 * 1024 * 1024;

/** Câu mở sẵn theo phân loại, để kế toán sửa chứ không phải viết từ đầu. */
function soanSan(action: string, tenNhom: string): string {
  const chung = `Cảm ơn ${tenNhom} đã phản hồi.`;
  switch (action) {
    case 'trao_doi_them':
      return `${chung}\n\nVề nội dung Quý khách nêu, team xperise xin trao đổi như sau:\n\n`;
    case 'tu_choi':
      return `${chung}\n\nTeam xperise đã ghi nhận ý kiến của Quý khách và xin phản hồi như sau:\n\n`;
    case 'review':
      return `${chung}\n\nTeam xperise xin bổ sung thêm thông tin để Quý khách tiện đối chiếu:\n\n`;
    default:
      return `${chung}\n\n`;
  }
}

type TepDinh = { id: string; ten: string; kichCo: number };

/**
 * Soạn và gửi một câu trả lời vào đúng thread bảng kê.
 *
 * Tách khỏi ba nút quyết định vì hai việc không luôn đi cùng nhau: có lúc kế
 * toán cần hỏi lại khách rồi mới quyết được, có lúc quyết luôn không cần nói gì.
 */
export function ReplyBox({ row }: { row: any }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [mo, setMo] = useState(false);
  const [noiDung, setNoiDung] = useState('');
  const [tep, setTep] = useState<TepDinh[]>([]);
  const [dangTai, setDangTai] = useState(false);
  const [loi, setLoi] = useState('');
  const [xong, setXong] = useState('');
  const [dangGui, start] = useTransition();

  function batDau() {
    setNoiDung(soanSan(row.ai_de_xuat ?? '', row.ten_nhom));
    setMo(true);
    setLoi('');
    setXong('');
  }

  async function themTep(list: FileList | null) {
    if (!list?.length) return;
    setLoi('');
    setDangTai(true);

    for (const f of Array.from(list)) {
      const duoi = '.' + (f.name.split('.').pop() ?? '').toLowerCase();
      if (!DUOI_HOP_LE.includes(duoi)) {
        setLoi(`Bỏ qua "${f.name}" — không nhận định dạng ${duoi}.`);
        continue;
      }
      if (f.size > GIOI_HAN) {
        setLoi(`Bỏ qua "${f.name}" — vượt 25 MB.`);
        continue;
      }

      try {
        const cho = await xinChoLuuTep(
          row.group_id, row.ky_doi_soat, 'trao_doi', f.name, row.dot ?? 1);

        const { error } = await supabaseBrowser()
          .storage.from('bang-ke')
          .upload(cho.path, f, { contentType: f.type || undefined, upsert: false });
        if (error) throw new Error(error.message);

        const kq = await ghiNhanTep({
          groupId: row.group_id, ky: row.ky_doi_soat, kind: 'trao_doi',
          dot: row.dot ?? 1,
          batchId: crypto.randomUUID(),
          version: cho.version,
          storagePath: cho.path,
          fileName: f.name,
          mimeType: f.type || 'application/octet-stream',
          sizeBytes: f.size,
          guiNgay: false,
        });

        setTep((p) => [...p, { id: (kq as any).fileId ?? cho.path, ten: f.name, kichCo: f.size }]);
      } catch (e) {
        setLoi(e instanceof Error ? e.message : `Không tải được ${f.name}.`);
      }
    }

    setDangTai(false);
    if (inputRef.current) inputRef.current.value = '';
  }

  function gui() {
    if (!noiDung.trim()) { setLoi('Nội dung thư không được để trống.'); return; }
    setLoi('');
    start(async () => {
      try {
        const kq = await traLoiKhach({
          trackingId: row.id,
          noiDung,
          fileIds: tep.map((t) => t.id),
        });
        setXong(`Đã gửi cho ${row.ten_nhom}`
          + (kq.soTep ? ` kèm ${kq.soTep} tệp.` : '.'));
        setMo(false);
        setNoiDung('');
        setTep([]);
        router.refresh();
      } catch (e) {
        setLoi(e instanceof Error ? e.message : 'Không gửi được.');
      }
    });
  }

  if (!mo) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn btn-sm" onClick={batDau}>Trả lời khách</button>
        {xong && <span className="text-[11.5px]" style={{ color: 'var(--stable)' }}>{xong}</span>}
      </div>
    );
  }

  return (
    <div className="card card-pad flex flex-col gap-3">
      <div>
        <p className="eyebrow mb-1">Trả lời khách</p>
        <p className="card-note m-0">
          Thư đi vào đúng chuỗi hội thoại cũ. Gửi thư không đổi trạng thái kỳ và
          không đụng đồng hồ SLA — quyết định vẫn nằm ở ba nút bên dưới.
        </p>
      </div>

      <div>
        <label className="label" htmlFor={`tl-${row.id}`}>Nội dung</label>
        <textarea id={`tl-${row.id}`} className="field" rows={7} value={noiDung}
                  onChange={(e) => setNoiDung(e.target.value)} />
        <p className="text-[11px] text-[var(--ink-3)] mt-1 mb-0">
          Cách một dòng trống để tách đoạn. Chữ ký và lời chào đã có sẵn trong mẫu.
        </p>
      </div>

      <div>
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <button className="btn btn-sm" onClick={() => inputRef.current?.click()}
                  disabled={dangTai || dangGui}>
            {dangTai ? 'Đang tải tệp…' : 'Đính kèm tệp'}
          </button>
          <span className="text-[11px] text-[var(--ink-3)]">
            {DUOI_HOP_LE.join(' · ')} — tối đa 25 MB
          </span>
          <input ref={inputRef} type="file" className="hidden" multiple
                 accept={DUOI_HOP_LE.join(',')}
                 onChange={(e) => themTep(e.target.files)} />
        </div>

        {tep.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {tep.map((t) => (
              <span key={t.id} className="pill pill-neutral">
                {t.ten}
                <button className="ml-1" aria-label={`Bỏ ${t.ten}`}
                        onClick={() => setTep((p) => p.filter((x) => x.id !== t.id))}
                        style={{ background: 'none', border: 0, cursor: 'pointer', color: 'inherit' }}>
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {loi && <p role="alert" className="callout callout-critical m-0">{loi}</p>}

      <div className="flex gap-2">
        <button className="btn btn-primary btn-sm" onClick={gui}
                disabled={dangGui || dangTai || !noiDung.trim()}>
          {dangGui ? 'Đang gửi…' : 'Gửi cho khách'}
        </button>
        <button className="btn btn-sm" onClick={() => { setMo(false); setLoi(''); }}
                disabled={dangGui}>
          Hủy
        </button>
      </div>
    </div>
  );
}
