// Hành trình hướng dẫn: các chặng theo thứ tự công việc thật, mỗi bước trỏ tới 1 mục có sẵn trong thư viện.
// Lưu trong guides.extras (kind = 'journey') nên dùng chung cơ chế lưu, phiên bản, tệp đính kèm, quyền.

export type JRole = { id: string; name: string; color: string };
export type JStep = { g: string; s: string; role: string; phase?: string; title?: string };
export type JStage = { id: string; title: string; goal?: string; gate?: string; color: string; steps: JStep[]; files?: string[] };
export type Journey = { roles: JRole[]; stages: JStage[]; sources?: Record<string, string> };

export const DEFAULT_ROLES: JRole[] = [
  { id: 'vh', name: 'Vận hành', color: '#00826F' },
  { id: 'td', name: 'Tổng đài', color: '#2F6FE0' },
  { id: 'qt', name: 'Quản trị viên khách', color: '#8A2FD0' },
  { id: 'nv', name: 'Nhân viên khách', color: '#D63384' },
  { id: 'dv', name: 'Đơn vị vận tải', color: '#D9730D' },
  { id: 'tx', name: 'Tài xế', color: '#B7791F' },
  { id: 'all', name: 'Mọi người', color: '#5B6470' },
];
export const STAGE_COLORS = ['#00A693', '#3B85FF', '#6C5CE7', '#B041FF', '#E84393', '#ED8118', '#E83C3F', '#0EA5E9', '#16A34A'];

const t = (v: unknown, max = 300) => String(v ?? '').trim().slice(0, max);
const color = (v: unknown, d: string) => (/^#[0-9a-f]{6}$/i.test(String(v)) ? String(v) : d);

/** Kiểm tra / làm sạch dữ liệu hành trình trước khi lưu */
export function cleanJourney(j: unknown): Journey | undefined {
  if (!j || typeof j !== 'object') return undefined;
  const J = j as Partial<Journey>;
  const roles = (Array.isArray(J.roles) && J.roles.length ? J.roles : DEFAULT_ROLES).slice(0, 12)
    .map((r, i) => ({ id: t(r.id, 20) || `r${i}`, name: t(r.name, 60) || `Vai trò ${i + 1}`, color: color(r.color, '#5B6470') }));
  const stages = (Array.isArray(J.stages) ? J.stages : []).slice(0, 20).map((s, i) => ({
    id: t(s.id, 40) || `c${i + 1}`, title: t(s.title, 120) || `Chặng ${i + 1}`, goal: t(s.goal, 400) || undefined, gate: t(s.gate, 400) || undefined,
    color: color(s.color, STAGE_COLORS[i % STAGE_COLORS.length]),
    steps: (Array.isArray(s.steps) ? s.steps : []).slice(0, 80).map((x) => ({ g: t(x.g, 100), s: t(x.s, 60), role: t(x.role, 20) || 'all', ...(t(x.phase, 100) ? { phase: t(x.phase, 100) } : {}), ...(t(x.title, 200) ? { title: t(x.title, 200) } : {}) })).filter((x) => x.g && x.s),
    files: (Array.isArray(s.files) ? s.files : []).map((f) => t(f, 40)).filter((f) => /^[0-9a-f-]{36}$/i.test(f)).slice(0, 30),
  }));
  const sources: Record<string, string> = {};
  if (J.sources && typeof J.sources === 'object') for (const [k, v] of Object.entries(J.sources).slice(0, 50)) if (t(k, 100) && t(v, 40)) sources[t(k, 100)] = t(v, 40);
  return { roles, stages, sources };
}
