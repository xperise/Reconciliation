'use client';

// Nút chuyển Xperise | MLX — đặt trong header, ngay trước chuông thông báo
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/', label: 'Xperise', match: (p: string) => !p.startsWith('/mlx') },
  { href: '/mlx', label: 'MLX', match: (p: string) => p.startsWith('/mlx') },
];

export default function AppTabs() {
  const pathname = usePathname() ?? '/';
  return (
    <div
      role="tablist"
      aria-label="Chuyển ứng dụng"
      style={{
        display: 'inline-flex',
        padding: 3,
        gap: 2,
        border: '1px solid #e3e8ec',
        borderRadius: 999,
        background: '#f4f6f8',
        flexShrink: 0,
      }}
    >
      {TABS.map((t) => {
        const active = t.match(pathname);
        return (
          <Link
            key={t.href}
            href={t.href}
            role="tab"
            aria-selected={active}
            style={{
              padding: '5px 14px',
              borderRadius: 999,
              fontSize: 13,
              fontWeight: 600,
              lineHeight: '18px',
              textDecoration: 'none',
              whiteSpace: 'nowrap',
              color: active ? '#ffffff' : '#46535f',
              background: active ? '#0f7ae5' : 'transparent',
              boxShadow: active ? '0 1px 2px rgba(18,36,51,.15)' : 'none',
            }}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
