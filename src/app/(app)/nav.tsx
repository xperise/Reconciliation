'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/client';

const MUC = [
  { href: '/',            label: 'Tổng quan' },
  { href: '/tracking',   label: 'Theo dõi kỳ' },
  { href: '/approvals',  label: 'Chờ duyệt', highlight: true },
  { href: '/files',      label: 'Tệp bảng kê' },
  { href: '/master-data',label: 'Master Data' },
  { href: '/workflows',  label: 'Workflow' },
  { href: '/audit',      label: 'Nhật ký' },
  { href: '/guide',      label: 'Hướng dẫn' },
  { href: '/users',      label: 'Người dùng', adminOnly: true },
  { href: '/settings',   label: 'Cài đặt',    adminOnly: true },
];

export function Nav({ role, email, soChoDuyet }: {
  role: string; email: string; soChoDuyet: number;
}) {
  const path = usePathname();
  const router = useRouter();

  async function dangXuat() {
    await supabaseBrowser().auth.signOut();
    router.push('/login');
    router.refresh();
  }

  const VAI_TRO: Record<string, string> = {
    admin: 'Quản trị', ke_toan: 'Kế toán', pm: 'PM', high_level: 'Cấp quản lý',
  };

  return (
    <nav className="w-[214px] shrink-0 border-r border-[var(--line)] bg-[var(--surface)] flex flex-col">
      {/* Brand */}
      <div className="px-5 py-[18px] border-b border-[var(--line)]">
        <p className="eyebrow m-0 mb-1">xperise</p>
        <p className="text-[0.9375rem] font-bold mt-0 mb-0 leading-tight text-[var(--ink)]">
          Đối soát bảng kê
        </p>
      </div>

      {/* Nav items */}
      <ul className="list-none m-0 p-2.5 flex-1 space-y-0.5">
        {MUC.filter((m) => !m.adminOnly || role === 'admin').map((m) => {
          const active = m.href === '/' ? path === '/' : path.startsWith(m.href);
          return (
            <li key={m.href}>
              <Link
                href={m.href}
                aria-current={active ? 'page' : undefined}
                className={[
                  'flex items-center justify-between px-3 py-[7px] rounded-[var(--r-sm)] text-[13px] no-underline transition-colors',
                  active
                    ? 'bg-[var(--violet-soft)] text-[var(--violet-deep)] font-semibold'
                    : 'text-[var(--ink-2)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]',
                ].join(' ')}
              >
                {m.label}
                {m.highlight && soChoDuyet > 0 && (
                  <span className="badge badge-violet !py-0 !px-1.5 text-[10px]">{soChoDuyet}</span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>

      {/* User footer */}
      <div className="px-4 py-4 border-t border-[var(--line)]">
        <p className="text-[11.5px] text-[var(--ink-3)] m-0 truncate" title={email}>{email}</p>
        <p className="text-[11.5px] font-semibold text-[var(--ink-2)] mt-0.5 mb-2">
          {VAI_TRO[role] ?? role}
        </p>
        <button onClick={dangXuat} className="btn btn-sm w-full">Đăng xuất</button>
      </div>
    </nav>
  );
}
