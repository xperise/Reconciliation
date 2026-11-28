'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const MUC = [
  { href: '/tuan-thu/huong-dan', label: 'Hướng dẫn A→Z' },
  { href: '/tuan-thu', label: 'Lần chạy bảng kê', exact: true },
  { href: '/tuan-thu/ceo', label: 'Tổng quan CEO' },
  { href: '/tuan-thu/cau-hinh', label: 'Cấu hình quy trình' },
  { href: '/tuan-thu/quy-tac', label: 'Hợp đồng, quy tắc & mẫu' },
  { href: '/tuan-thu/agent', label: 'Agent của tôi' },
  { href: '/tuan-thu/thanh-vien', label: 'Thành viên', admin: true },
];

export function SubNav({ laAdmin, vaiTro }: { laAdmin: boolean; vaiTro: string }) {
  const p = usePathname() ?? '';
  const on = (m: (typeof MUC)[number]) => (m.exact ? p === m.href || p.startsWith('/tuan-thu/chay') : p.startsWith(m.href));
  return (
    <nav className="tabs no-print" aria-label="Tuân thủ bảng kê">
      {MUC.filter((m) => !m.admin || laAdmin).map((m) => (
        <Link key={m.href} href={m.href} className="tab" data-active={on(m)}>{m.label}</Link>
      ))}
      <span className="ml-auto self-center text-[11.5px] text-[var(--ink-3)] pr-2">Vai trò: <b>{vaiTro}</b></span>
    </nav>
  );
}
