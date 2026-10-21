'use client';
// Tab Hướng dẫn — trình sửa: thông tin chung, từng mục (Markdown + xem trước), chèn ảnh, phiên bản, xoá
import './guide.css';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { renderMd } from '@/lib/guide/md';
import { AUDIENCES, SERVICES, STATUSES, newId, type Guide, type GuideSection } from '@/lib/guide/meta';
import { dsPhienBan, layPhienBan, luuHuongDan, xoaHuongDan, type VersionRow } from '@/app/(app)/huong-dan/actions';

type Meta = { title: string; service: string; audience: string; summary: string; version: string; owner: string; status: string; sort: number };
const TOOLS: [string, string, string][] = [   // § … § = phần được bôi đen sau khi chèn để gõ đè
  ['ri-bold', 'Chữ đậm', '**§chữ đậm§**'], ['ri-italic', 'Chữ nghiêng', '*§chữ nghiêng§*'], ['ri-heading', 'Tiêu đề nhỏ', '\n## §Tiêu đề§\n'],
  ['ri-list-ordered', 'Các bước', '\n1. §Bước một§\n2. Bước hai\n'], ['ri-list-unordered', 'Gạch đầu dòng', '\n- §Ý một§\n- Ý hai\n'],
  ['ri-checkbox-line', 'Checklist', '\n- [ ] §Việc cần làm§\n- [ ] Việc tiếp theo\n'], ['ri-table-line', 'Bảng', '\n| §Cột 1§ | Cột 2 |\n|---|---|\n| … | … |\n'],
  ['ri-information-line', 'Hộp lưu ý', '\n> [!NOTE] §Nội dung lưu ý§\n'], ['ri-alert-line', 'Hộp cảnh báo', '\n> [!WARNING] §Nội dung cảnh báo§\n'],
  ['ri-code-line', 'Mã / đường dẫn menu', '`§admin.uts.network → Menu§`'], ['ri-link', 'Liên kết', '[§tên liên kết§](https://)'],
];

/** Nén ảnh: cạnh dài tối đa 1600px, giữ PNG cho ảnh chụp màn hình nhỏ, còn lại JPEG 85% */
async function compress(f: File): Promise<{ data: string; mime: string }> {
  const img = await createImageBitmap(f);
  const k = Math.min(1, 1600 / Math.max(img.width, img.height)), w = Math.round(img.width * k), h = Math.round(img.height * k);
  const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d')!.drawImage(img, 0, 0, w, h);
  let mime = f.type === 'image/png' ? 'image/png' : 'image/jpeg';
  let url = c.toDataURL(mime, 0.85);
  if (mime === 'image/png' && url.length > 1_400_000) { mime = 'image/jpeg'; url = c.toDataURL(mime, 0.85); }
  return { data: url.split(',')[1], mime };
}

export default function GuideEditor({ guide, onCancel }: { guide?: Guide; onCancel?: () => void }) {
  const router = useRouter();
  const [m, setM] = useState<Meta>({
    title: guide?.title || '', service: guide?.service || 'mobility', audience: guide?.audience || 'internal', summary: guide?.summary || '',
    version: guide?.version || '1.0', owner: guide?.owner || '', status: guide?.status || 'nhap', sort: guide?.sort ?? 100,
  });
  const [secs, setSecs] = useState<GuideSection[]>(guide?.sections?.length ? guide.sections : [{ id: newId(), title: 'Giới thiệu', md: '' }]);
  const [prev, setPrev] = useState(true);
  const [note, setNote] = useState('');
  const [err, setErr] = useState(''), [ok, setOk] = useState('');
  const [busy, start] = useTransition();
  const [up, setUp] = useState('');
  const [vers, setVers] = useState<VersionRow[] | null>(null);
  const [dirty, setDirty] = useState(false);
  const refs = useRef<Record<string, HTMLTextAreaElement | null>>({});

  useEffect(() => { const h = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } }; window.addEventListener('beforeunload', h); return () => window.removeEventListener('beforeunload', h); }, [dirty]);
  const setMeta = (k: keyof Meta, v: string | number) => { setM((x) => ({ ...x, [k]: v })); setDirty(true); };
  const setSec = (id: string, p: Partial<GuideSection>) => { setSecs((S) => S.map((s) => (s.id === id ? { ...s, ...p } : s))); setDirty(true); };
  const move = (i: number, d: number) => { setSecs((S) => { const T = S.slice(); const j = i + d; if (j < 0 || j >= T.length) return S; [T[i], T[j]] = [T[j], T[i]]; return T; }); setDirty(true); };

  /** chèn mẫu vào vị trí con trỏ; phần giữa hai dấu § được bôi đen để gõ đè */
  function insert(id: string, tpl: string) {
    const ta = refs.current[id]; const s = secs.find((x) => x.id === id); if (!s) return;
    const a = ta ? ta.selectionStart : s.md.length, b = ta ? ta.selectionEnd : s.md.length, sel = s.md.slice(a, b);
    const P = tpl.split('§'), pre = P[0], mid = P[1] ?? '', post = P.slice(2).join('§');
    const body = sel || mid, md = s.md.slice(0, a) + pre + body + post + s.md.slice(b);
    setSec(id, { md });
    requestAnimationFrame(() => { if (!ta) return; ta.focus(); ta.setSelectionRange(a + pre.length, a + pre.length + body.length); });
  }
  async function addImages(id: string, files: FileList | File[]) {
    const F = Array.from(files).filter((f) => f.type.startsWith('image/')); if (!F.length) return;
    setErr('');
    for (const [k, f] of F.entries()) {
      setUp(`Đang tải ảnh ${k + 1}/${F.length}…`);
      try {
        const c = await compress(f);
        const r = await fetch('/api/guides/img', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...c, guideId: guide?.id || null }) });
        const j = await r.json(); if (!r.ok) throw new Error(j.error || 'Không tải được ảnh');
        insert(id, `\n![§Mô tả ảnh§](${j.url})\n`);
      } catch (e) { setErr('Ảnh "' + f.name + '": ' + (e instanceof Error ? e.message : String(e))); }
    }
    setUp('');
  }
  function save() {
    setErr(''); setOk('');
    if (!m.title.trim()) { setErr('Cần có tiêu đề.'); return; }
    start(async () => {
      try {
        const r = await luuHuongDan({ id: guide?.id || null, ...m, sections: secs, note });
        setDirty(false); setNote(''); setOk('Đã lưu.');
        if (!guide || guide.slug !== r.slug) router.replace(`/huong-dan/${r.slug}`); else { router.refresh(); onCancel?.(); }
      } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    });
  }
  function del() {
    if (!guide || !window.confirm(`Xoá hẳn hướng dẫn "${guide.title}"? Không khôi phục được.`)) return;
    start(async () => { try { await xoaHuongDan(guide.id); setDirty(false); router.replace('/huong-dan'); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } });
  }
  async function openVers() { if (!guide) return; try { setVers(await dsPhienBan(guide.id)); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } }
  async function loadVer(v: VersionRow) {
    if (!window.confirm(`Nạp nội dung phiên bản lưu lúc ${new Date(v.saved_at).toLocaleString('vi-VN')} vào trình sửa? Bấm Lưu thì mới ghi thành bản mới.`)) return;
    try {
      const p = await layPhienBan(v.id); setSecs(p.sections || []); setM((x) => ({ ...x, title: p.title || x.title, version: p.version || x.version, ...(p.meta || {}) } as Meta));
      setDirty(true); setVers(null); setOk('Đã nạp phiên bản cũ — kiểm tra rồi bấm Lưu.');
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }
  const html = useMemo(() => Object.fromEntries(secs.map((s) => [s.id, prev ? renderMd(s.md, s.id).html : ''])), [secs, prev]);

  return (
    <div className="hd"><div className="hd-wrap">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 14, position: 'sticky', top: 56, zIndex: 3, background: 'var(--canvas, #f4f6f8)', padding: '8px 0' }}>
        <div><div className="hd-eyebrow">{guide ? 'Sửa hướng dẫn' : 'Hướng dẫn mới'}</div><b style={{ fontSize: 17 }}>{m.title || 'Chưa đặt tên'}</b>{dirty && <span className="hd-pill hd-pill-draft" style={{ marginLeft: 8 }}>Chưa lưu</span>}</div>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <label className="hd-muted" style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={prev} onChange={(e) => setPrev(e.target.checked)} /> Xem trước</label>
          {guide && <button className="hd-btn" onClick={openVers}><i className="ri-history-line" /> Phiên bản</button>}
          <button className="hd-btn" onClick={() => { if (!dirty || window.confirm('Bỏ các thay đổi chưa lưu?')) { setDirty(false); if (onCancel) onCancel(); else router.push('/huong-dan'); } }}>Huỷ</button>
          <input className="hd-input" style={{ width: 230 }} placeholder="Ghi chú lần lưu (không bắt buộc)" value={note} onChange={(e) => setNote(e.target.value)} />
          <button className="hd-btn hd-btn-pri" onClick={save} disabled={busy}>{busy ? 'Đang lưu…' : m.status === 'phat-hanh' ? 'Lưu & phát hành' : 'Lưu nháp'}</button>
        </span>
      </div>
      {err && <div className="hd-err" style={{ marginBottom: 10 }}>{err}</div>}
      {ok && <div className="hd-ok" style={{ marginBottom: 10 }}>{ok}</div>}
      {up && <div className="hd-ok" style={{ marginBottom: 10 }}>{up}</div>}

      {vers && <div className="hd-card" style={{ padding: 14, marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}><b>Các phiên bản đã lưu</b><button className="hd-btn hd-btn-sm" onClick={() => setVers(null)}>Đóng</button></div>
        {!vers.length ? <span className="hd-muted">Chưa có phiên bản nào.</span> : <div style={{ maxHeight: 260, overflow: 'auto' }}>{vers.map((v) => (
          <div key={v.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--hd-line-2)', fontSize: 13 }}>
            <span style={{ minWidth: 150 }}>{new Date(v.saved_at).toLocaleString('vi-VN')}</span><span className="hd-pill">v{v.version}</span>
            <span className="hd-muted" style={{ flex: 1 }}>{v.saved_by}{v.note ? ` · ${v.note}` : ''}</span>
            <button className="hd-btn hd-btn-sm" onClick={() => loadVer(v)}>Nạp bản này</button>
          </div>))}</div>}
      </div>}

      <div className="hd-card" style={{ padding: 16, marginBottom: 14 }}>
        <div style={{ marginBottom: 10 }}><label className="hd-label">Tiêu đề</label><input className="hd-input" style={{ fontSize: 16, fontWeight: 600 }} value={m.title} onChange={(e) => setMeta('title', e.target.value)} placeholder="Ví dụ: Hướng dẫn kích hoạt thẻ XPAY cho nhân viên" /></div>
        <div className="hd-meta-grid">
          <div><label className="hd-label">Mảng dịch vụ</label><select className="hd-select" value={m.service} onChange={(e) => setMeta('service', e.target.value)}>{SERVICES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
          <div><label className="hd-label">Đối tượng</label><select className="hd-select" value={m.audience} onChange={(e) => setMeta('audience', e.target.value)}>{AUDIENCES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
          <div><label className="hd-label">Trạng thái</label><select className="hd-select" value={m.status} onChange={(e) => setMeta('status', e.target.value)}>{STATUSES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div><label className="hd-label">Phiên bản</label><input className="hd-input" value={m.version} onChange={(e) => setMeta('version', e.target.value)} /></div>
            <div><label className="hd-label">Thứ tự</label><input className="hd-input" type="number" value={m.sort} onChange={(e) => setMeta('sort', Number(e.target.value))} /></div>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 260px', gap: 10, marginTop: 10 }}>
          <div><label className="hd-label">Tóm tắt (hiện ở danh sách và trang bìa PDF)</label><input className="hd-input" value={m.summary} onChange={(e) => setMeta('summary', e.target.value)} /></div>
          <div><label className="hd-label">Người phụ trách nội dung</label><input className="hd-input" value={m.owner} onChange={(e) => setMeta('owner', e.target.value)} placeholder="Team Vận hành" /></div>
        </div>
        <div className="hd-muted" style={{ marginTop: 10 }}>Bài <b>Nháp</b> chỉ người có quyền sửa thấy. Chuyển sang <b>Đã phát hành</b> để mọi người có quyền xem tab Hướng dẫn thấy. Bài cho Khách hàng / Đơn vị: xuất PDF để gửi.</div>
      </div>

      {secs.map((s, i) => (
        <div key={s.id} className="hd-card hd-ed-sec" onPaste={(e) => { if (e.clipboardData.files.length) { e.preventDefault(); addImages(s.id, e.clipboardData.files); } }} onDrop={(e) => { if (e.dataTransfer.files.length) { e.preventDefault(); addImages(s.id, e.dataTransfer.files); } }} onDragOver={(e) => e.preventDefault()}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <b style={{ color: 'var(--hd-primary)', minWidth: 22 }}>{i + 1}.</b>
            <input className="hd-input" style={{ fontWeight: 600 }} value={s.title} onChange={(e) => setSec(s.id, { title: e.target.value })} placeholder="Tên mục (hiện trong mục lục)" />
            <button className="hd-btn hd-btn-sm" title="Lên" disabled={!i} onClick={() => move(i, -1)}><i className="ri-arrow-up-line" /></button>
            <button className="hd-btn hd-btn-sm" title="Xuống" disabled={i === secs.length - 1} onClick={() => move(i, 1)}><i className="ri-arrow-down-line" /></button>
            <button className="hd-btn hd-btn-sm hd-btn-danger" title="Xoá mục" onClick={() => { if (!s.md.trim() || window.confirm(`Xoá mục "${s.title}"?`)) { setSecs((S) => S.filter((x) => x.id !== s.id)); setDirty(true); } }}><i className="ri-delete-bin-line" /></button>
          </div>
          <div className="hd-ed-tools">
            {TOOLS.map(([ic, t, tpl]) => <button key={ic} className="hd-btn hd-btn-sm" title={t} onClick={() => insert(s.id, tpl)}><i className={ic} /></button>)}
            <label className="hd-btn hd-btn-sm" title="Chèn ảnh (hoặc dán / kéo thả ảnh vào ô soạn)"><i className="ri-image-add-line" /> Ảnh<input type="file" accept="image/*" multiple hidden onChange={(e) => { if (e.target.files) addImages(s.id, e.target.files); e.target.value = ''; }} /></label>
            <span className="hd-muted" style={{ alignSelf: 'center', marginLeft: 6, fontSize: 11.5 }}>Dán ảnh chụp màn hình trực tiếp vào ô soạn</span>
          </div>
          <div className={prev ? 'hd-ed-split' : ''}>
            <textarea ref={(el) => { refs.current[s.id] = el; }} className="hd-textarea" value={s.md} onChange={(e) => setSec(s.id, { md: e.target.value })} placeholder="Viết nội dung… Dùng các nút phía trên để chèn bước, checklist, bảng, hộp lưu ý, ảnh." rows={Math.min(30, Math.max(10, s.md.split('\n').length + 2))} />
            {prev && <div className="hd-ed-prev hd-md" dangerouslySetInnerHTML={{ __html: html[s.id] || '<span class="hd-muted">Xem trước hiện ở đây.</span>' }} />}
          </div>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <button className="hd-btn" onClick={() => { setSecs((S) => [...S, { id: newId(), title: `Mục ${S.length + 1}`, md: '' }]); setDirty(true); }}><i className="ri-add-line" /> Thêm mục</button>
        {guide && <button className="hd-btn hd-btn-danger" onClick={del} disabled={busy}><i className="ri-delete-bin-line" /> Xoá hướng dẫn</button>}
      </div>
    </div></div>
  );
}
