'use client';
// Nhập gói hướng dẫn (.json do Claude chuyển đổi từ tài liệu có sẵn): tải ảnh lên trước, thay link ảnh, rồi lưu từng bài
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { GuideInput } from '@/app/(app)/huong-dan/actions';
import { nhapGoiHuongDan } from '@/app/(app)/huong-dan/actions';

type Bundle = { format: string; version: number; source?: string; guides: GuideInput[]; images?: Record<string, string>; replaces?: string[] };

export default function ImportBundle() {
  const router = useRouter();
  const [b, setB] = useState<Bundle | null>(null), [name, setName] = useState('');
  const [msg, setMsg] = useState(''), [err, setErr] = useState(''), [busy, setBusy] = useState(false), [del, setDel] = useState(true);

  async function pick(f: File) {
    setErr(''); setMsg('');
    try {
      const j = JSON.parse(await f.text()) as Bundle;
      if (j.format !== 'xperise-guides' || !Array.isArray(j.guides)) throw new Error('Không phải gói hướng dẫn hợp lệ.');
      setB(j); setName(f.name);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }
  async function run() {
    if (!b) return;
    if (del && b.replaces?.length && !window.confirm(`Xoá hẳn ${b.replaces.length} bài cũ có nội dung trùng (kèm phiên bản và tệp đính kèm của chúng)? Không khôi phục được.`)) return;
    setBusy(true); setErr('');
    try {
      const keys = Object.keys(b.images || {}), map: Record<string, string> = {};
      for (const [i, k] of keys.entries()) {
        setMsg(`Đang tải ảnh ${i + 1}/${keys.length}…`);
        const d = b.images![k], m = d.match(/^data:([^;]+);base64,(.*)$/);
        if (!m) continue;
        const r = await fetch('/api/guides/img', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: m[2], mime: m[1], key: `goi:${k}` }) });
        const j = await r.json(); if (!r.ok) throw new Error(`Ảnh ${k}: ${j.error || r.status}`);
        map[k] = j.url;
      }
      setMsg('Đang lưu các bài hướng dẫn…');
      const guides = b.guides.map((g) => ({ ...g, sections: g.sections.map((s) => ({ ...s, md: s.md.replace(/\(img:([^)\s]+)\)/g, (_, k) => `(${map[k] || '#'})`) })) }));
      const r = await nhapGoiHuongDan(guides, del ? b.replaces || [] : []);
      setMsg(`Xong: ${r.created} bài mới, ${r.updated} bài cập nhật${r.deleted ? `, đã xoá ${r.deleted} bài cũ` : ''}.`);
      setB(null); router.refresh();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  }
  return (
    <>
      <label className="hd-btn" title="Nhập gói hướng dẫn .json"><i className="ri-inbox-unarchive-line" /> Nhập gói<input type="file" accept=".json,application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) pick(f); e.target.value = ''; }} /></label>
      {(b || msg || err) && (
        <div className="hd-lb" style={{ cursor: 'default' }} onClick={(e) => { if (e.target === e.currentTarget && !busy) { setB(null); setMsg(''); setErr(''); } }}>
          <div className="hd-card" style={{ background: '#fff', color: 'var(--hd-ink)', padding: 20, width: 'min(620px, 94vw)', marginTop: 0 }}>
            <div className="hd-eyebrow">Nhập gói hướng dẫn</div>
            <h3 style={{ margin: '4px 0 10px' }}>{name || 'Gói hướng dẫn'}</h3>
            {b && <>
              <div className="hd-muted" style={{ marginBottom: 8 }}>{b.source ? `Nguồn: ${b.source} · ` : ''}{b.guides.length} bài · {Object.keys(b.images || {}).length} ảnh</div>
              <ul style={{ margin: '0 0 10px', paddingLeft: 18, fontSize: 13, lineHeight: 1.7 }}>{b.guides.map((g) => <li key={g.slug}><b>{g.title}</b> <span className="hd-muted">· {g.sections.length} mục</span></li>)}</ul>
              <div className="hd-muted" style={{ marginBottom: 8 }}>Bài trùng đường dẫn sẽ được ghi đè nội dung; bản cũ vẫn xem lại được trong Phiên bản. Tệp đính kèm đã gắn không bị ảnh hưởng.</div>
              {!!b.replaces?.length && <label style={{ display: 'flex', gap: 8, fontSize: 13, marginBottom: 12, alignItems: 'flex-start' }}><input type="checkbox" checked={del} onChange={(e) => setDel(e.target.checked)} style={{ marginTop: 3 }} /> <span>Xoá hẳn {b.replaces.length} bài cũ có nội dung trùng, chỉ giữ nội dung và cấu trúc mới<br /><span className="hd-muted">Kèm phiên bản và tệp đính kèm của các bài đó · không khôi phục được</span></span></label>}
            </>}
            {msg && <div className="hd-ok" style={{ marginBottom: 8 }}>{msg}</div>}
            {err && <div className="hd-err" style={{ marginBottom: 8 }}>{err}</div>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="hd-btn" disabled={busy} onClick={() => { setB(null); setMsg(''); setErr(''); }}>{b ? 'Huỷ' : 'Đóng'}</button>
              {b && <button className="hd-btn hd-btn-pri" disabled={busy} onClick={run}>{busy ? 'Đang nhập…' : 'Nhập'}</button>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
