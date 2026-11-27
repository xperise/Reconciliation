import { createHash, randomBytes } from 'crypto';

/** Mã mời ngẫu nhiên (gửi trong đường dẫn) và băm của nó (lưu trong bảng). */
export function taoMaMoi(): { ma: string; bam: string } {
  const ma = randomBytes(24).toString('base64url');
  return { ma, bam: bamMa(ma) };
}

export function bamMa(ma: string): string {
  return createHash('sha256').update(ma).digest('hex');
}

export const HAN_LOI_MOI_NGAY = 7;

export function hetHan(tu: Date = new Date()): string {
  return new Date(tu.getTime() + HAN_LOI_MOI_NGAY * 24 * 60 * 60 * 1000).toISOString();
}
