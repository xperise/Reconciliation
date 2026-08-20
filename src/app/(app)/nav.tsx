'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/client';

const MUC = [
  { href: '/', label: 'Tổng quan' },
  { href: '/tracking', label: 'Theo dõi kỳ' },
  { href: '/approvals', label: 'Chờ duyệt', highlight: true },
  { href: '/files', label: 'Tệp bảng kê' },
  { href: '/master-data', label: 'Master Data' },
  { href: '/workflows', label: 'Workflow' },
  { href: '/audit', label: 'Nhật ký' },
  { href: '/users', label: 'Người dùng', adminOnly: true },
  { href: '/settings', label: 'Cài đặt', adminOnly: true },
];

export function Nav({ role, email, soChoDuyet }: { role: string; email: string; soChoDuyet: number }) {
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
    <nav className="w-[210px] shrink-0 border-r border-[var(--line)] bg-[var(--surface)] flex flex-col">
      <div className="px-5 py-5 border-b border-[var(--line)]">
        <p className="eyebrow m-0">xperise</p>
        <p className="text-[0.9375rem] font-bold mt-1 mb-0 leading-tight">Đối soát bảng kê</p>
      </div>

      <ul className="list-none m-0 p-3 flex-1 space-y-0.5">
        {MUC.filter((m) => !m.adminOnly || role === 'admin').map((m) => {
          const active = m.href === '/' ? path === '/' : path.startsWith(m.href);
          return (
            <li key={m.href}>
              <Link
                href={m.href}
                aria-current={active ? 'page' : undefined}
                className={`flex items-center justify-between px-3 py-2 rounded-md text-sm no-underline
                  ${active
                    ? 'bg-[var(--teal-wash)] text-[var(--teal-deep)] font-semibold'
                    : 'text-[var(--ink-soft)] hover:bg-[var(--line-soft)]'}`}
              >
                {m.label}
                {m.highlight && soChoDuyet > 0 && (
                  <span className="badge badge-violet !px-1.5 !py-0 tnum">{soChoDuyet}</span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="px-4 py-4 border-t border-[var(--line)]">
        <p className="text-xs text-[var(--muted)] m-0 truncate" title={email}>{email}</p>
        <p className="text-xs font-semibold text-[var(--ink-soft)] mt-0.5 mb-2">{VAI_TRO[role] ?? role}</p>
        <button onClick={dangXuat} className="btn btn-sm w-full">Đăng xuất</button>
      </div>
    </nav>
  );
}
