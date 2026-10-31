// Đường dẫn riêng cho từng phần của tab Dashboard (mở thẳng, bookmark, gửi link đúng chỗ)
//   /dashboard/overview/<tab>        Tổng quan: home · cash · kpi · alerts · data
//   /dashboard/travel-saas/<tab>     Travel & SaaS: revenue · customers · ar · ap · opex · kpi · alerts
//   /dashboard/mobility/<tab>[/...]  Mobility: overall · roadmap · progress/{dashboard|pattern|input} · update   (?kh=<mã khách> mở hồ sơ)
export type SecKey = 'all' | 'ts' | 'm';
const SEC_SLUG: Record<SecKey, string> = { all: 'overview', ts: 'travel-saas', m: 'mobility' };
const SLUG_SEC: Record<string, SecKey> = { overview: 'all', 'tong-quan': 'all', 'travel-saas': 'ts', travel: 'ts', mobility: 'm' };
/** tên tab trong code ↔ đường dẫn (chỉ khác ở KPI của Travel & SaaS) */
const TAB_OUT: Record<string, string> = { kpiseg: 'kpi' };
const TAB_IN: Record<SecKey, Record<string, string>> = { all: {}, ts: { kpi: 'kpiseg' }, m: {} };

export type Route = { sec: SecKey | null; tab: string | null; mob: string; kh: string };
export function parseRoute(pathname: string, search = ''): Route {
  const p = pathname.replace(/^\/dashboard\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  const sec = SLUG_SEC[p[0] ?? ''] ?? null;
  const kh = new URLSearchParams(search).get('kh') ?? '';
  if (sec === 'm') return { sec, tab: null, mob: p.slice(1).join('/'), kh };
  return { sec, tab: sec && p[1] ? TAB_IN[sec][p[1]] ?? p[1] : null, mob: '', kh };
}
export function routePath(sec: SecKey, tab?: string | null, mob?: string, kh?: string): string {
  if (sec === 'm') return `/dashboard/mobility${mob ? '/' + mob : ''}${kh ? `?kh=${encodeURIComponent(kh)}` : ''}`;
  return `/dashboard/${SEC_SLUG[sec]}${tab ? '/' + (TAB_OUT[tab] ?? tab) : ''}`;
}
