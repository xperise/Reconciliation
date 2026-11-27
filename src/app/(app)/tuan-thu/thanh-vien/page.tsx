import { supabaseAdmin } from '@/lib/supabase/admin';
import { PageHeader } from '@/components/PageHeader';
import { nguoiTT } from '@/lib/tuan-thu/db';
import { ChonPhongBan, QuyenNguoi } from './client';
import { MoiForm, ThuHoi } from './moi-form';
import { toChucHienTai } from '@/lib/tuan-thu/to-chuc-server';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const n = await nguoiTT();
  if (!n?.laAdmin) return <div className="callout callout-high">Chỉ admin phân quyền.</div>;
  const sb = supabaseAdmin();
  const org = await toChucHienTai();
  const [{ data: users }, { data: tv }, { data: roles }, { data: qs }] = await Promise.all([
    sb.from('profiles').select('id, email, full_name, role, is_active').eq('is_active', true).order('email'),
    sb.from('tt_thanh_vien').select('*').eq('org_id', org),
    sb.from('tt_role').select('key, ten').eq('org_id', org).order('thu_tu').order('key'),
    sb.from('tt_quyen').select('user_id, quyen').eq('org_id', org),
  ]);
  const { data: loiMoi } = await sb.from('tt_loi_moi').select('id, email, phong_ban, het_han').eq('org_id', org).eq('trang_thai', 'dang_cho').order('created_at', { ascending: false });
  const pb = new Map((tv ?? []).map((x: any) => [x.user_id, x.phong_ban]));
  const quyenCua = new Map<string, string[]>();
  for (const q of (qs ?? []) as any[]) quyenCua.set(q.user_id, [...(quyenCua.get(q.user_id) ?? []), q.quyen]);
  return (
    <>
      <PageHeader eyebrow="Tuân thủ bảng kê" title="Thành viên & phòng ban"
        description="Mỗi người một phòng ban; người được gán mới vào được phần này và chỉ duyệt được bước của phòng mình. Admin vào được và làm thay được mọi phòng (giai đoạn pilot), mọi thao tác đều ghi tên người làm." />
      <section className="card card-pad mb-4">
        <h2 className="card-title mb-2">Mời thành viên qua email</h2>
        <MoiForm roles={(roles ?? []) as any} />
        {(loiMoi ?? []).length > 0 && (
          <ul className="mt-3 text-[13px] space-y-1">
            {(loiMoi ?? []).map((m: any) => (
              <li key={m.id}>Đang chờ: <b>{m.email}</b> · hết hạn {new Date(m.het_han).toLocaleDateString('vi-VN')} · <ThuHoi id={m.id} /></li>
            ))}
          </ul>
        )}
      </section>
      <div className="card overflow-hidden">
        <table className="tbl"><thead><tr><th>Họ tên</th><th>Email</th><th>Vai trò hệ thống</th><th>Phòng ban trong Tuân thủ</th><th>Quyền bổ sung</th></tr></thead>
          <tbody>{(users ?? []).map((u: any) => (
            <tr key={u.id}><td className="font-semibold">{u.full_name || '—'}</td><td className="text-xs">{u.email}</td><td>{u.role}</td>
              <td><ChonPhongBan userId={u.id} dau={pb.get(u.id) ?? ''} roles={(roles ?? []) as any} /></td>
              <td><QuyenNguoi userId={u.id} dang={quyenCua.get(u.id) ?? []} /></td></tr>))}</tbody></table>
      </div>
    </>
  );
}
