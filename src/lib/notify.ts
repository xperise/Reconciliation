import { supabaseAdmin } from './supabase/admin';

/**
 * Thông báo hiện trên chuông ở góc phải màn hình.
 *
 * Đi song song với email chứ không thay thế: email để người không mở web vẫn
 * biết, chuông để người đang làm việc trên web không phải nhảy qua hộp thư.
 */
export type MucThongBao = 'info' | 'canh_bao' | 'khan';

export async function pushNotify(input: {
  tieuDe: string;
  noiDung?: string;
  muc?: MucThongBao;
  lienKet?: string;
  roles?: ('admin' | 'ke_toan' | 'pm' | 'high_level')[];
  userId?: string;
  entity?: string;
  entityId?: string;
}) {
  try {
    await supabaseAdmin().from('notifications').insert({
      tieu_de: input.tieuDe,
      noi_dung: input.noiDung ?? null,
      muc: input.muc ?? 'info',
      lien_ket: input.lienKet ?? null,
      roles: input.roles ?? null,
      user_id: input.userId ?? null,
      entity: input.entity ?? null,
      entity_id: input.entityId ?? null,
    });
  } catch (err) {
    // Không để việc thông báo hỏng làm gãy nghiệp vụ chính
    console.error('[notify]', err);
  }
}
