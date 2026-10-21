// Thanh chuyển trong tab Hướng dẫn: Tổng quan · Theo vai trò
import Link from 'next/link';
export type NavOn = 'hub' | 'library' | 'suco' | 'journey';
export default function GuideNav({ on, journeySlug }: { on: NavOn; journeySlug?: string | null }) {
  const T: [NavOn[], string, string, string][] = [
    ...(journeySlug ? [[['hub', 'suco', 'journey'], '/huong-dan', 'ri-compass-3-line', 'Tổng quan'] as [NavOn[], string, string, string]] : []),
    [['library'], '/huong-dan/thu-vien', 'ri-book-2-line', 'Theo vai trò'],
  ];
  return (
    <nav className="hj-nav" aria-label="Chế độ xem hướng dẫn">
      {T.map(([k, h, ic, l]) => <Link key={h} href={h} data-on={k.includes(on)}><i className={ic} /> {l}</Link>)}
    </nav>
  );
}
