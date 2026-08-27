'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/client';

const LOGO = 'https://files.uts.network/email_assets/xperise_alt_fulllogo%402x.png';

type Muc = { href: string; label: string; badge?: boolean; adminOnly?: boolean };
type Nhom = { ten: string; muc: Muc[] };

/** Bốn nhóm tab. Mục nào của nhóm cũng dẫn thẳng, không có menu thả xuống. */
const NHOM: Nhom[] = [
  { ten: 'Tổng quan', muc: [{ href: '/', label: 'Dashboard' }] },
  {
    ten: 'Bảng kê',
    muc: [
      { href: '/files', label: 'Tệp bảng kê' },
      { href: '/approvals', label: 'Chờ duyệt', badge: true },
      { href: '/tracking', label: 'Theo dõi kỳ' },
      { href: '/audit', label: 'Nhật ký' },
    ],
  },
  {
    ten: 'Quản lý',
    muc: [
      { href: '/master-data', label: 'Master Data' },
      { href: '/workflows', label: 'Workflow' },
      { href: '/users', label: 'Người dùng', adminOnly: true },
      { href: '/settings', label: 'Cài đặt', adminOnly: true },
    ],
  },
  { ten: 'Hỗ trợ', muc: [{ href: '/guide', label: 'Hướng dẫn' }] },
];

const VAI_TRO: Record<string, string> = {
  admin: 'Quản trị', ke_toan: 'Kế toán', pm: 'PM', high_level: 'Cấp quản lý',
};

export function Shell({ role, email, soChoDuyet, children }: {
  role: string; email: string; soChoDuyet: number; children: React.ReactNode;
}) {
  const path = usePathname();
  const router = useRouter();

  const isOn = (href: string) => (href === '/' ? path === '/' : path.startsWith(href));

  // Nhóm nào đang chứa trang hiện tại thì mở hàng tab con của nhóm đó
  const nhomHienTai = NHOM.find((n) => n.muc.some((m) => isOn(m.href))) ?? NHOM[0];
  const mucTrongNhom = nhomHienTai.muc.filter((m) => !m.adminOnly || role === 'admin');

  async function dangXuat() {
    await supabaseBrowser().auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <>
      <header className="topbar">
        <img src={LOGO} alt="xperise" className="topbar-logo" />
        <span className="topbar-div" />
        <span className="topbar-name">Đối soát bảng kê</span>

        <div className="ml-auto flex items-center gap-3">
          <div className="text-right leading-tight hidden sm:block">
            <div className="text-[11.5px] text-[var(--ink-2)] font-semibold">{email}</div>
            <div className="text-[10.5px] text-[var(--ink-3)]">{VAI_TRO[role] ?? role}</div>
          </div>
          <button onClick={dangXuat} className="btn btn-sm no-print">Đăng xuất</button>
        </div>
      </header>

      {/* Hàng 1: nhóm tab */}
      <nav className="tabs no-print" aria-label="Nhóm chức năng">
        {NHOM.map((n) => {
          const dau = n.muc.find((m) => !m.adminOnly || role === 'admin');
          if (!dau) return null;
          const on = n.ten === nhomHienTai.ten;
          return (
            <Link key={n.ten} href={dau.href} className="tab" data-active={on}>
              {n.ten}
              {n.ten === 'Bảng kê' && soChoDuyet > 0 && (
                <span className="pill pill-watch chip-count !px-1.5 !py-0 !text-[10px]">{soChoDuyet}</span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Hàng 2: mục trong nhóm, chỉ hiện khi nhóm có nhiều hơn một mục */}
      {mucTrongNhom.length > 1 && (
        <nav
          className="tabs no-print !top-[89px] !py-0"
          style={{ background: 'var(--surface-2)' }}
          aria-label={`Mục trong ${nhomHienTai.ten}`}
        >
          {mucTrongNhom.map((m) => (
            <Link key={m.href} href={m.href} className="tab !text-[12.5px] !py-2" data-active={isOn(m.href)}>
              {m.label}
              {m.badge && soChoDuyet > 0 && (
                <span className="pill pill-watch chip-count !px-1.5 !py-0 !text-[10px]">{soChoDuyet}</span>
              )}
            </Link>
          ))}
        </nav>
      )}

      <main className="page">{children}</main>
    </>
  );
}
