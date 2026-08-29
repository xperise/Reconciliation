/**
 * Sổ ghi email của một lượt chạy workflow.
 *
 * Trước đây tóm tắt chỉ nói "gửi thành công 12/40 nhóm", không cho biết ai
 * nhận thư gì. Khi khách gọi lên hỏi "sao tôi bị nhắc hai lần", không có chỗ
 * nào tra được. Mỗi workflow giờ ghi lại từng thư đã gửi vào đây, và bộ điều
 * phối lưu vào cột detail của workflow_runs.
 */
export type MailRecord = {
  nhom: string;
  ky: string;
  loai: string;          // 'Bảng kê' | 'Nhắc khách L2' | 'Escalate nội bộ' …
  den: string;
  cc?: string;
  tieu_de: string;
  luc: string;
};

export class MailLog {
  private items: MailRecord[] = [];

  ghi(r: Omit<MailRecord, 'luc'>) {
    this.items.push({ ...r, luc: new Date().toISOString() });
  }

  get all(): MailRecord[] { return this.items; }
  get count(): number { return this.items.length; }

  /** Một dòng tóm tắt cho người đọc nhanh. */
  tomTat(): string {
    if (!this.items.length) return 'Không gửi thư nào.';
    const theoLoai = new Map<string, number>();
    for (const m of this.items) theoLoai.set(m.loai, (theoLoai.get(m.loai) ?? 0) + 1);
    return [...theoLoai.entries()].map(([k, v]) => `${k} ×${v}`).join(', ');
  }
}
