'use client';
// Tài liệu đính kèm của 1 hướng dẫn: ai xem được bài cũng tải được; người có quyền sửa thêm / đổi tên / xoá tệp
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import type { GuideFile } from '@/lib/guide/meta';
import { ghiNhanTepHuongDan, suaTepHuongDan, xinChoTepHuongDan, xoaTepHuongDan } from '@/app/(app)/huong-dan/actions';

const kb = (n: number | null) => (n == null ? '' : n > 1048576 ? `${(n / 1048576).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const kind = (f: { file_name: string; mime_type: string | null }) => {
  const e = f.file_name.toLowerCase().split('.').pop() || '';
  if (e === 'pdf') return ['', 'ri-file-pdf-2-line'];
  if (['doc', 'docx'].includes(e)) return ['doc', 'ri-file-word-2-line'];
  if (['xls', 'xlsx', 'csv'].includes(e)) return ['xls', 'ri-file-excel-2-line'];
  if (['ppt', 'pptx'].includes(e)) return ['ppt', 'ri-file-ppt-2-line'];
  if ((f.mime_type || '').startsWith('image/')) return ['img', 'ri-image-line'];
  return ['doc', 'ri-file-line'];
};
const noExt = (n: string) => n.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();

export default function FilesBox({ guideId, files, canEdit, internal }: { guideId: string; files: GuideFile[]; canEdit: boolean; internal?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(''), [err, setErr] = useState(''), [drag, setDrag] = useState(false);
  const [edit, setEdit] = useState<string | null>(null), [lab, setLab] = useState(''), [note, setNote] = useState('');

  async function upload(list: FileList | File[]) {
    const F = Array.from(list); if (!F.length) return;
    setErr('');
    for (const [i, f] of F.entries()) {
      if (f.size > 50 * 1048576) { setErr(`"${f.name}" lớn hơn 50 MB.`); continue; }
      setBusy(`Đang tải lên ${i + 1}/${F.length}: ${f.name}…`);
      try {
        const c = await xinChoTepHuongDan(guideId, f.name);
        const { error } = await supabaseBrowser().storage.from('guide-files').uploadToSignedUrl(c.path, c.token, f, { contentType: f.type || undefined });
        if (error) throw new Error(error.message);
        await ghiNhanTepHuongDan({ guideId, path: c.path, label: noExt(f.name), fileName: f.name, mime: f.type, size: f.size });
      } catch (e) { setErr(`"${f.name}": ${e instanceof Error ? e.message : String(e)}`); }
    }
    setBusy(''); router.refresh();
  }
  async function act(fn: () => Promise<unknown>) { setErr(''); try { await fn(); router.refresh(); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } }
  const move = (i: number, d: number) => { const a = files[i], b = files[i + d]; if (!a || !b) return; act(async () => { await suaTepHuongDan(a.id, { sort: b.sort }); await suaTepHuongDan(b.id, { sort: a.sort === b.sort ? a.sort + d : a.sort }); }); };

  if (!files.length && !canEdit) return null;
  return (
    <div className="hd-card hd-files">
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 4, flexWrap: 'wrap' }}>
        <b style={{ fontSize: 15 }}><i className="ri-attachment-2" /> Tài liệu đính kèm</b>
        <span className="hd-muted">Tải về để gửi cho khách hàng, đơn vị hoặc tài xế khi cần{internal ? ' · bộ này là tài liệu nội bộ, kiểm tra tệp trước khi gửi ra ngoài' : ''}</span>
      </div>
      {!files.length && <div className="hd-muted" style={{ padding: '8px 0' }}>Chưa có tệp nào.</div>}
      {files.map((f, i) => { const [k, ic] = kind(f); return (
        <div key={f.id} className="hd-file">
          <div className={`hd-file-ic ${k}`}><i className={ic} /></div>
          {edit === f.id ? (
            <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr auto auto', gap: 6 }}>
              <input className="hd-input" value={lab} onChange={(e) => setLab(e.target.value)} placeholder="Tên hiển thị" />
              <input className="hd-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ghi chú: gửi cho ai, khi nào" />
              <button className="hd-btn hd-btn-sm hd-btn-pri" onClick={() => act(async () => { await suaTepHuongDan(f.id, { label: lab, note }); setEdit(null); })}>Lưu</button>
              <button className="hd-btn hd-btn-sm" onClick={() => setEdit(null)}>Huỷ</button>
            </div>
          ) : (
            <div style={{ flex: 1, minWidth: 0 }}>
              <b>{f.label}</b>
              <div className="hd-muted" style={{ fontSize: 12 }}>{f.note ? <>{f.note} · </> : null}{f.file_name} · {kb(f.size_bytes)} · cập nhật {new Date(f.uploaded_at).toLocaleDateString('vi-VN')}</div>
            </div>
          )}
          {edit !== f.id && <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            {(k === '' || k === 'img') && <a className="hd-btn hd-btn-sm" href={`/api/guides/files/${f.id}?xem=1`} target="_blank" rel="noopener">Xem</a>}
            <a className="hd-btn hd-btn-sm hd-btn-pri" href={`/api/guides/files/${f.id}`}><i className="ri-download-2-line" /> Tải về</a>
            {canEdit && <>
              <button className="hd-btn hd-btn-sm" title="Lên" disabled={!i} onClick={() => move(i, -1)}><i className="ri-arrow-up-line" /></button>
              <button className="hd-btn hd-btn-sm" title="Đổi tên, ghi chú" onClick={() => { setEdit(f.id); setLab(f.label); setNote(f.note || ''); }}><i className="ri-edit-line" /></button>
              <button className="hd-btn hd-btn-sm hd-btn-danger" title="Xoá tệp" onClick={() => { if (window.confirm(`Xoá tệp "${f.label}"?`)) act(() => xoaTepHuongDan(f.id)); }}><i className="ri-delete-bin-line" /></button>
            </>}
          </div>}
        </div>); })}
      {canEdit && (
        <label className="hd-drop" data-on={drag} style={{ display: 'block', marginTop: 10 }}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); upload(e.dataTransfer.files); }}>
          <input type="file" multiple hidden onChange={(e) => { if (e.target.files) upload(e.target.files); e.target.value = ''; }} />
          {busy || <><i className="ri-upload-2-line" /> Kéo thả hoặc bấm để gắn tệp (PDF, Word, PowerPoint, Excel, ảnh · tối đa 50 MB/tệp)</>}
        </label>
      )}
      {err && <div className="hd-err" style={{ marginTop: 8 }}>{err}</div>}
    </div>
  );
}
