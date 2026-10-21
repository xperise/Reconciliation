'use client';
// Trung tâm hướng dẫn: bức tranh tổng thể trước (ai làm gì ở chặng nào) → chọn vai trò / làm theo hành trình / tải tài liệu / tra sự cố
import './guide.css';
import Link from 'next/link';
import { useMemo } from 'react';
import type { Guide, GuideFile } from '@/lib/guide/meta';
import { DEFAULT_ROLES, type JStep } from '@/lib/guide/journey';
import GuideNav from './GuideNav';
import GuideSearch from './GuideSearch';

type LibG = Pick<Guide, 'slug' | 'title' | 'audience' | 'sections' | 'status' | 'summary' | 'extras' | 'files'>;
const kb = (n: number | null) => (n == null ? '' : n > 1048576 ? `${(n / 1048576).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export default function HubView({ journey, lib, canEdit }: { journey: Guide; lib: Record<string, LibG>; canEdit: boolean }) {
  const J = journey.extras!.journey!;
  const roles = (J.roles?.length ? J.roles : DEFAULT_ROLES).filter((r) => r.id !== 'all');
  const RC = Object.fromEntries((J.roles?.length ? J.roles : DEFAULT_ROLES).map((r) => [r.id, r]));
  const jURL = (k: number, p: number, role?: string) => `/huong-dan/${journey.slug}${role ? `?vai=${role}` : ''}#${J.stages[k].id}/${p + 1}`;
  const secOf = (x: JStep) => lib[x.g]?.sections.find((s) => s.id === x.s);

  // ô sơ đồ: theo vai trò × chặng → các nhóm bước (phase) kèm bước đầu tiên của nhóm
  const cell = (role: string, k: number) => {
    const out: { label: string; n: number; first: number }[] = [];
    J.stages[k].steps.forEach((x, p) => {
      if (x.role !== role && !(x.role === 'all')) return;
      const label = (x.phase || secOf(x)?.title || x.s).replace(/^\d+\s·\s/, '');
      const o = out.find((y) => y.label === label);
      if (o) o.n++; else out.push({ label, n: 1, first: p });
    });
    return out;
  };
  // mỗi vai trò → bộ hướng dẫn được dùng nhiều nhất trong hành trình
  const roleGuide = (role: string) => {
    const c: Record<string, number> = {};
    J.stages.forEach((s) => s.steps.forEach((x) => { if (x.role === role) c[x.g] = (c[x.g] || 0) + 1; }));
    const g = Object.entries(c).sort((a, b) => b[1] - a[1])[0]?.[0];
    return g ? lib[g] : undefined;
  };
  const firstOf = (role: string) => { for (let k = 0; k < J.stages.length; k++) { const p = J.stages[k].steps.findIndex((x) => x.role === role); if (p >= 0) return [k, p] as const; } return [0, 0] as const; };
  const stat = (g?: LibG) => g ? { m: g.sections.length, b: g.sections.reduce((a, s) => a + (s.md.match(/^### Bước/gm) || []).length, 0), a: g.sections.reduce((a, s) => a + (s.md.match(/!\[/g) || []).length, 0) } : { m: 0, b: 0, a: 0 };
  const totalSteps = J.stages.reduce((a, s) => a + s.steps.length, 0);

  // tài liệu tải về: tệp theo chặng của hành trình + tệp của từng bộ hướng dẫn
  const files = useMemo(() => {
    const rows: { f: GuideFile; where: string; color: string }[] = [], seen = new Set<string>();
    J.stages.forEach((s, k) => (s.files || []).forEach((id) => { const f = (journey.files || []).find((x) => x.id === id); if (f && !seen.has(f.id)) { seen.add(f.id); rows.push({ f, where: `Chặng ${k + 1} · ${s.title}`, color: s.color }); } }));
    (journey.files || []).forEach((f) => { if (!seen.has(f.id)) { seen.add(f.id); rows.push({ f, where: 'Hành trình', color: '#5B6470' }); } });
    Object.values(lib).forEach((g) => (g.files || []).forEach((f) => { if (!seen.has(f.id)) { seen.add(f.id); rows.push({ f, where: g.title, color: '#5B6470' }); } }));
    return rows;
  }, [J, journey.files, lib]);

  return (
    <div className="hd"><div className="hd-wrap">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 10, flexWrap: 'wrap' }}>
        <GuideNav on="hub" journeySlug={journey.slug} />
        {canEdit && <Link className="hd-btn" href={`/huong-dan/${journey.slug}?sua=1`}><i className="ri-drag-move-2-line" /> Sắp xếp hành trình</Link>}
      </div>

      <section className="hh-hero">
        <div className="hd-eyebrow" style={{ color: '#ffffffcc', position: 'relative' }}>Trung tâm hướng dẫn XPAY · Xperise</div>
        <h1>Từ nhận khách mới đến chuyến xe đầu tiên</h1>
        <p>Gặp vấn đề cụ thể? Gõ mô tả vào ô dưới — hệ thống tìm tới đúng bước, câu hỏi hay dòng tra lỗi, hoặc bấm <b>Hỏi trợ lý</b> để nhận câu trả lời tóm tắt có dẫn nguồn. Muốn nắm cả quy trình: xem bức tranh tổng thể bên dưới.</p>
        <div className="hh-stats"><span>{J.stages.length} chặng</span><span>{totalSteps} bước</span><span>{roles.length} vai trò</span><span>{files.length} tài liệu tải về</span></div>
        <div style={{ marginTop: 18, maxWidth: 760, position: 'relative' }}><GuideSearch lib={lib} journey={J} journeySlug={journey.slug} /></div>
      </section>

      <div className="hh-sec"><span className="hh-n">1</span><h2>Bức tranh tổng thể</h2><p>Đọc từ trái sang phải. Ô nào có việc nghĩa là vai trò đó phải làm ở chặng đó — bấm để mở bước đầu tiên của nhóm việc.</p></div>
      <div className="hd-card hh-flow">
        <div className="hh-grid" style={{ ['--n' as string]: J.stages.length }}>
          <div className="hh-corner">Vai trò \ Chặng</div>
          {J.stages.map((s, k) => <div key={s.id} className="hh-col" style={{ ['--c' as string]: s.color }}><a href={jURL(k, 0)}><span className="hh-cn">{k + 1}</span><b>{s.title}</b></a></div>)}
          {roles.map((r) => <div key={r.id} style={{ display: 'contents' }}>
            <div className="hh-role" style={{ ['--rc' as string]: r.color }}>{r.name}</div>
            {J.stages.map((s, k) => <div key={s.id} className="hh-cell" style={{ ['--c' as string]: s.color }}>
              {cell(r.id, k).map((c) => <a key={c.label} className="hh-chip" href={jURL(k, c.first, r.id)}>{c.label}<small>{c.n} bước</small></a>)}
            </div>)}
          </div>)}
        </div>
        <div className="hh-flow-foot"><span><i className="ri-information-line" /> Các bước của “Mọi người” (ví dụ bảng tra lỗi) hiện ở mọi hàng.</span><span>Chặng 6 lặp lại mỗi ngày; chặng 7 dùng khi có sự cố.</span></div>
      </div>

      <div className="hh-sec"><span className="hh-n">2</span><h2>Bạn là ai?</h2><p>Chọn vai trò để đọc hướng dẫn đầy đủ, hoặc làm theo hành trình chỉ với các bước của bạn.</p></div>
      <div className="hh-who">
        {roles.map((r) => { const g = roleGuide(r.id), st = stat(g), [k, p] = firstOf(r.id); const nSt = J.stages.filter((s) => s.steps.some((x) => x.role === r.id)).length; return (
          <div key={r.id} className="hd-card hh-card" style={{ ['--rc' as string]: r.color }}>
            <div className="hh-card-top" />
            <div className="hh-card-b">
              <span className="hj-badge" style={{ ['--rc' as string]: r.color, alignSelf: 'flex-start' }}>{r.name}</span>
              <h3>{g?.title || r.name}</h3>
              {g?.summary && <p>{g.summary.length > 160 ? g.summary.slice(0, 157) + '…' : g.summary}</p>}
              {g?.extras?.portal && <code>{g.extras.portal}</code>}
              <div className="hh-ct">Tham gia {nSt}/{J.stages.length} chặng · {st.m} mục · {st.b} bước · {st.a} ảnh{g?.files?.length ? ` · ${g.files.length} tệp` : ''}</div>
              <div className="hh-act">
                <a className="hd-btn hd-btn-sm hd-btn-pri" href={jURL(k, p, r.id)} style={{ background: r.color, borderColor: r.color }}>Hành trình của tôi →</a>
                {g && <Link className="hd-btn hd-btn-sm" href={`/huong-dan/${g.slug}`}>Đọc hướng dẫn đầy đủ</Link>}
              </div>
            </div>
          </div>); })}
      </div>

      <div className="hh-sec"><span className="hh-n">3</span><h2>{J.stages.length} chặng trong 1 phút</h2><p>Mục tiêu và điều kiện hoàn thành của từng chặng. Bấm để làm theo từng bước.</p></div>
      <div className="hh-stages">
        {J.stages.map((s, k) => <a key={s.id} href={jURL(k, 0)} className="hd-card hh-st" data-n={k + 1} style={{ ['--c' as string]: s.color }}>
          <h3><span>{k + 1}</span>{s.title}</h3>
          {s.goal && <p>{s.goal}</p>}
          {s.gate && <div className="hh-gate"><b style={{ color: s.color }}>Xong khi:</b> {s.gate}</div>}
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>{[...new Set(s.steps.map((x) => x.role))].map((rid) => <span key={rid} className="hj-badge" style={{ ['--rc' as string]: RC[rid]?.color || '#5B6470' }}>{RC[rid]?.name || rid}</span>)}</div>
          <span className="hh-go">{s.steps.length} bước · làm theo chặng này →</span>
        </a>)}
      </div>

      <div className="hh-sec"><span className="hh-n">4</span><h2>Tài liệu tải về</h2><p>Bản PDF có sẵn để gửi cho khách hàng, đơn vị, tài xế. {canEdit ? 'Gắn tệp ở khung “Tài liệu gửi đi” của từng chặng trong Hành trình, hoặc ở từng hướng dẫn.' : ''}</p></div>
      <div className="hd-card hh-files">
        {files.length ? <table><thead><tr><th>Tài liệu</th><th>Dùng ở</th><th>Tệp</th><th /></tr></thead><tbody>
          {files.map(({ f, where, color }) => <tr key={f.id}>
            <td><b>{f.label}</b>{f.note && <div className="hd-muted" style={{ fontSize: 12 }}>{f.note}</div>}</td>
            <td><span className="hj-badge" style={{ ['--rc' as string]: color }}>{where}</span></td>
            <td className="hd-muted" style={{ fontSize: 12 }}>{f.file_name} · {kb(f.size_bytes)}</td>
            <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}><a className="hd-btn hd-btn-sm" href={`/api/guides/files/${f.id}?xem=1`} target="_blank" rel="noopener">Xem</a> <a className="hd-btn hd-btn-sm hd-btn-pri" href={`/api/guides/files/${f.id}`}>Tải về</a></td>
          </tr>)}</tbody></table> : <div className="hd-muted" style={{ padding: 16 }}>Chưa có tài liệu nào được gắn.</div>}
      </div>

      <div className="hh-sec"><span className="hh-n">5</span><h2>Gặp lỗi?</h2></div>
      <Link href="/huong-dan/su-co" className="hd-card hh-alert" style={{ textDecoration: 'none', color: 'inherit' }}>
        <i className="ri-alarm-warning-line big" />
        <div style={{ flex: 1 }}><b style={{ fontSize: 15 }}>Sự cố thường gặp — tra theo triệu chứng</b><div className="hd-muted">Không gán được thẻ, PIN sai, hết hạn mức, không có xe… lọc theo vai trò, xem nguyên nhân, cách xử lý và mở đúng bước.</div></div>
        <span className="hd-btn hd-btn-sm">Mở →</span>
      </Link>
    </div></div>
  );
}
