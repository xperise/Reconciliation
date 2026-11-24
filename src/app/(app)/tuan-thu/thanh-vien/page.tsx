import { supabaseAdmin } from '@/lib/supabase/admin';
import { PageHeader } from '@/components/PageHeader';
import { nguoiTT } from '@/lib/tuan-thu/db';
import { ChonPhongBan } from './client';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const n = await nguoiTT();
  if (!n?.laAdmin) return <div className="callout callout-high">Chỉ admin phân quyền.</div>;
  const sb = supabaseAdmin();
  const [{ data: users }, { data: tv }] = await Promise.all([
    sb.from('profiles').select('id, email, full_name, role, is_active').eq('is_active', true).order('email'),
    sb.from('tt_thanh_vien').select('*'),
  ]);
  const pb = new Map((tv ?? []).map((x: any) => [x.user_id, x.phong_ban]));
  return (
    <>
      <PageHeader eyebrow="Tuân thủ bảng kê" title="Thành viên & phòng ban"
        description="Mỗi người một phòng ban; người được gán mới vào được phần này và chỉ duyệt được bước của phòng mình. Admin vào được và làm thay được mọi phòng (giai đoạn pilot), mọi thao tác đều ghi tên người làm." />
      <div className="card overflow-hidden">
        <table className="tbl"><thead><tr><th>Họ tên</th><th>Email</th><th>Vai trò hệ thống</th><th>Phòng ban trong Tuân thủ</th></tr></thead>
          <tbody>{(users ?? []).map((u: any) => (
            <tr key={u.id}><td className="font-semibold">{u.full_name || '—'}</td><td className="text-xs">{u.email}</td><td>{u.role}</td>
              <td><ChonPhongBan userId={u.id} dau={pb.get(u.id) ?? ''} /></td></tr>))}</tbody></table>
      </div>
    </>
  );
}
