// Bản in A4 của 1 hoặc nhiều hướng dẫn → trình duyệt "Lưu thành PDF". Nằm ngoài khung app (không có thanh tab).
import '@/components/guide/guide.css';
import { redirect } from 'next/navigation';
import { renderMd } from '@/lib/guide/md';
import { audienceLabel, serviceLabel } from '@/lib/guide/meta';
import { getGuides, guideUser } from '@/lib/guide/server';
import PrintBar from '@/components/guide/PrintBar';

export const dynamic = 'force-dynamic';

/** Tên file PDF mặc định = tiêu đề trang */
export async function generateMetadata({ searchParams }: { searchParams: { s?: string } }) {
  const s = String(searchParams.s || '').split(',').filter(Boolean);
  return { title: s.length === 1 ? `Xperise - ${decodeURIComponent(s[0])}` : `Xperise - bo-huong-dan-${new Date().toISOString().slice(0, 10)}` };
}
const LOGO = 'https://files.uts.network/email_assets/xperise_alt_fulllogo%402x.png';

export default async function InHuongDan({ searchParams }: { searchParams: { s?: string } }) {
  const g = await guideUser();
  if (!g) redirect('/login?loi=ho_so');
  const slugs = String(searchParams.s || '').split(',').map((x) => decodeURIComponent(x.trim())).filter(Boolean);
  let guides; try { guides = await getGuides(slugs, g.edit); } catch (e) { return <div style={{ padding: 24 }}>{e instanceof Error ? e.message : String(e)}</div>; }
  if (!guides.length) return <div style={{ padding: 24, fontFamily: 'sans-serif' }}>Không tìm thấy hướng dẫn để in.</div>;
  const one = guides.length === 1, G0 = guides[0];
  const title = one ? G0.title : `Bộ hướng dẫn · ${guides.length} tài liệu`;
  const auds = [...new Set(guides.map((x) => audienceLabel(x.audience)))].join(', ');
  const svcs = [...new Set(guides.map((x) => serviceLabel(x.service)))].join(', ');
  const last = guides.map((x) => x.updated_at).sort().pop()!;
  const drafts = guides.filter((x) => x.status !== 'phat-hanh').length;
  return (
    <div className="hd hd-print">
      <PrintBar drafts={drafts} />
      <div className="hd-page">
        <section className="hd-cover">
          <div className="hd-cover-band" />
          <img src={LOGO} alt="xperise" style={{ height: 34, alignSelf: 'flex-start' }} />
          <div className="hd-eyebrow" style={{ marginTop: '18mm' }}>Hướng dẫn sử dụng · {svcs}</div>
          <h1>{title}</h1>
          {one ? (G0.summary && <div className="hd-cover-sum">{G0.summary}</div>) : <ol className="hd-cover-sum" style={{ paddingLeft: '6mm' }}>{guides.map((x) => <li key={x.id}>{x.title}</li>)}</ol>}
          <dl>
            <dt>Dành cho</dt><dd>{auds}</dd>
            {one && <><dt>Phiên bản</dt><dd>{G0.version}</dd></>}
            <dt>Cập nhật</dt><dd>{new Date(last).toLocaleDateString('vi-VN')}</dd>
            {one && G0.owner && <><dt>Phụ trách</dt><dd>{G0.owner}</dd></>}
            <dt>Đơn vị phát hành</dt><dd>Xperise</dd>
          </dl>
        </section>
        <section className="hd-break hd-ptoc">
          <h2>Mục lục</h2>
          <ol>{guides.map((x) => one ? x.sections.map((s) => <li key={s.id}>{s.title}</li>) : <li key={x.id}><b>{x.title}</b><ol>{x.sections.map((s) => <li key={s.id}>{s.title}</li>)}</ol></li>)}</ol>
        </section>
        {guides.map((x, gi) => (
          <div key={x.id} className="hd-break">
            {!one && <><div className="hd-eyebrow">{gi + 1}. {serviceLabel(x.service)} · {audienceLabel(x.audience)} · v{x.version}</div><h1 className="hd-pguide-t">{x.title}</h1>{x.summary && <p className="hd-muted" style={{ fontSize: '10.5pt', marginTop: 0 }}>{x.summary}</p>}</>}
            {x.sections.map((s, i) => (
              <section key={s.id} className="hd-psec">
                <h2>{one ? '' : `${gi + 1}.`}{i + 1}. {s.title}</h2>
                <div className="hd-md" dangerouslySetInnerHTML={{ __html: renderMd(s.md, `${s.id}-${i}`).html }} />
              </section>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
