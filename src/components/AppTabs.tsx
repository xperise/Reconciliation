'use client';

// Thanh tab cấp cao nhất: Xperise (luồng gửi bảng kê hiện có) | MLX (chuyển đổi bảng kê taxi)
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/', label: 'Xperise', match: (p: string) => !p.startsWith('/mlx') },
  { href: '/mlx', label: 'MLX', match: (p: string) => p.startsWith('/mlx') },
];

export default function AppTabs() {
  const pathname = usePathname() ?? '/';
  return (
    <nav style={{ display: 'flex', gap: 4, borderBottom: '1px solid #e3e8ec', padding: '0 24px', background: '#fff' }}>
      {TABS.map((t) => {
        const active = t.match(pathname);
        return (
          <Link
            key={t.href}
            href={t.href}
            style={{
              padding: '12px 16px',
              fontWeight: 700,
              fontSize: 14,
              textDecoration: 'none',
              color: active ? '#122433' : '#8a96a0',
              borderBottom: `2px solid ${active ? '#0f7ae5' : 'transparent'}`,
              marginBottom: -1,
            }}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
