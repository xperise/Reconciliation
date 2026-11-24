import Link from 'next/link';
import { redirect } from 'next/navigation';
import { nguoiTT } from '@/lib/tuan-thu/db';
import { TEN_PHONG_BAN } from '@/lib/tuan-thu/types';
import { SubNav } from './subnav';

export const dynamic = 'force-dynamic';

export default async function TuanThuLayout({ children }: { children: React.ReactNode }) {
  let n;
  try { n = await nguoiTT(); } catch { n = null; }
  if (!n) {
    return (
      <main className="page">
        <div className="callout callout-high">
          Tài khoản chưa được cấp quyền phần <b>Tuân thủ bảng kê</b>, hoặc chưa chạy <code>supabase/migrations/38_tuan_thu.sql</code>.
          Admin vào <Link href="/tuan-thu/thanh-vien" className="underline">Thành viên</Link> để gán phòng ban.
        </div>
      </main>
    );
  }
  return (
    <>
      <SubNav laAdmin={n.laAdmin} vaiTro={n.phong_ban ? TEN_PHONG_BAN[n.phong_ban] : 'Admin (làm thay mọi phòng)'} />
      <main className="page">{children}</main>
    </>
  );
}
