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
  ['don-vi', 'Đơn vị (merchant, NCC)'],
  ['tai-xe', 'Tài xế'],
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

export type GuideSection = { id: string; title: string; md: string; group?: string };
/** Thông tin phụ của bộ hướng dẫn */
export type GuideExtras = {
  who?: string; portal?: string; internal?: boolean;
  tasks?: { t: string; d?: string; sec: string }[];     // "Việc hay làm" → link tới mục
  stats?: { k: string; v: string; d?: string }[];
};
export type GuideFile = { id: string; guide_id: string; label: string; note: string | null; file_name: string; mime_type: string | null; size_bytes: number | null; sort: number; uploaded_by: string | null; uploaded_at: string };
/** Tiêu đề mục đã tự đánh số (A.1. · B3.5. · 2.) thì không đánh số thêm */
export const hasOwnNumber = (t: string) => /^[A-Z]{0,2}\d*(\.\d+)*\.\s/.test(t);
export type GuideMeta = {
  id: string; slug: string; title: string; service: string; audience: string; summary: string | null;
  version: string; owner: string | null; status: string; sort: number; updated_at: string; updated_by: string | null;
};
export type Guide = GuideMeta & { sections: GuideSection[]; extras?: GuideExtras; files?: GuideFile[] };

/** Tạo slug từ tiêu đề tiếng Việt */
export function slugify(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'huong-dan';
}
export const newId = () => Math.random().toString(36).slice(2, 10);
