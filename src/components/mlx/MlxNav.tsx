'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import s from './mlx.module.css';

const ITEMS = [
  { href: '/mlx', label: 'Chuyển đổi bảng kê' },
  { href: '/mlx/lich-su', label: 'Lịch sử bảng kê' },
  { href: '/mlx/master-data', label: 'Master data khách hàng' },
];

export default function MlxNav() {
  const pathname = usePathname();
  return (
    <nav className={s.subnav}>
      {ITEMS.map((i) => (
        <Link key={i.href} href={i.href} className={`${s.subtab} ${pathname === i.href ? s.subtabActive : ''}`}>
          {i.label}
        </Link>
      ))}
    </nav>
  );
}
