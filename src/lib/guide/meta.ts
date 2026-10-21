// Tab Hướng dẫn — danh mục mảng dịch vụ, đối tượng, kiểu dữ liệu. Dùng chung server + trình duyệt.

export const SERVICES = [
  ['mobility', 'Mobility / XPAY'],
  ['travel', 'Travel — vé máy bay & khách sạn'],
  ['fnb', 'F&B'],
  ['saas', 'SaaS & nền tảng'],
  ['noi-bo', 'Hệ thống nội bộ'],
] as const;
export const AUDIENCES = [
  ['internal', 'Internal'],
  ['khach-hang', 'Khách hàng'],
  ['don-vi', 'Đơn vị (merchant, tài xế, NCC)'],
] as const;
export const STATUSES = [['nhap', 'Nháp'], ['phat-hanh', 'Đã phát hành']] as const;

export type Service = (typeof SERVICES)[number][0];
export type Audience = (typeof AUDIENCES)[number][0];
export type Status = (typeof STATUSES)[number][0];

export const serviceLabel = (k: string) => SERVICES.find(([s]) => s === k)?.[1] ?? k;
export const audienceLabel = (k: string) => AUDIENCES.find(([s]) => s === k)?.[1] ?? k;
export const statusLabel = (k: string) => STATUSES.find(([s]) => s === k)?.[1] ?? k;
export const isService = (k: string): k is Service => SERVICES.some(([s]) => s === k);
export const isAudience = (k: string): k is Audience => AUDIENCES.some(([s]) => s === k);

export type GuideSection = { id: string; title: string; md: string };
export type GuideMeta = {
  id: string; slug: string; title: string; service: string; audience: string; summary: string | null;
  version: string; owner: string | null; status: string; sort: number; updated_at: string; updated_by: string | null;
};
export type Guide = GuideMeta & { sections: GuideSection[] };

/** Tạo slug từ tiêu đề tiếng Việt */
export function slugify(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'huong-dan';
}
export const newId = () => Math.random().toString(36).slice(2, 10);
