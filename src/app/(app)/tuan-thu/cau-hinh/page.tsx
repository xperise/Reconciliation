import { PageHeader } from '@/components/PageHeader';
import { nguoiTT, coQuyen } from '@/lib/tuan-thu/db';
import { toChucHienTai } from '@/lib/tuan-thu/to-chuc-server';
import { docCauHinhQuyTrinh } from '@/lib/tuan-thu/cau-hinh-db';
import { CauHinhEditor } from './editor';
import { QuorumLoai } from './quorum-loai';
import { ThuVien } from './thu-vien';
import ThanhVienPage from '../thanh-vien/page';
import Link from 'next/link';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

/** Cấu hình quy trình: role và bước của tổ chức. Chỉ admin hoặc người được cấp quyền quản trị. */
export default async function Page({ searchParams }: { searchParams: { tab?: string } }) {
  const n = await nguoiTT();
  if (!n || !coQuyen(n, 'quan_tri')) return <p className="p-6 text-[var(--ink-2)]">Chỉ admin hoặc người được cấp quyền quản trị mới sửa cấu hình.</p>;
  const tab = searchParams.tab === 'thanh-vien' ? 'thanh-vien' : searchParams.tab === 'thu-vien' ? 'thu-vien' : 'quy-trinh';
  const { data: mauRows } = await supabaseAdmin().from('tt_hub_mau').select('id, ma, ten, mo_ta, nguon, kiem_dinh').order('nguon').order('ma');
  const mau = (mauRows ?? []) as any[];
  const org = await toChucHienTai();
  const cau = await docCauHinhQuyTrinh(org);
  const { data: tvRows } = await supabaseAdmin().from('tt_thanh_vien').select('user_id, phong_ban, profiles(email, full_name)').eq('org_id', org);
  const { data: loaiRows } = await supabaseAdmin().from('tt_quorum_loai').select('loai, ten, buoc_keys').eq('org_id', org).order('loai');
  const loai = ((loaiRows ?? []) as any[]).map((r) => ({ loai: r.loai as string, ten: r.ten as string, buocKeys: (r.buoc_keys ?? []) as string[] }));
  const thanhVien = ((tvRows ?? []) as any[]).map((t) => ({ id: t.user_id as string, role: t.phong_ban as string, ten: (t.profiles?.full_name || t.profiles?.email || t.user_id) as string }));
  const tabs = [['quy-trinh', 'Vai trò và bước duyệt'], ['thu-vien', 'Thư viện mẫu'], ['thanh-vien', 'Thành viên và quyền']] as const;
  return (
    <>
      <PageHeader eyebrow="Tuân thủ bảng kê" title="Cấu hình quy trình"
        description="Đặt role và bước duyệt của tổ chức. Máy trạng thái hiện hỗ trợ hai mức bước: mức đầu (kế toán) và mức cuối (CEO). Bước kiểm soát chỉ chặn hoặc trả về, không duyệt." />
      <nav className="tabs mb-4">
        {tabs.map(([k, t]) => <Link key={k} href={`/tuan-thu/cau-hinh?tab=${k}`} className="tab" data-active={tab === k}>{t}</Link>)}
      </nav>
      {tab === 'thu-vien' ? <ThuVien mau={mau} /> : tab === 'quy-trinh' ? (<>
        <CauHinhEditor roles={cau.roles} buoc={cau.buoc} thanhVien={thanhVien} />
        <QuorumLoai loai={loai} buoc={cau.buoc.map((b) => ({ key: b.key, roleKey: b.roleKey }))} />
      </>) : <ThanhVienPage />}
    </>
  );
}
