// Thanh chuyển trong tab Hướng dẫn: Tổng quan · Làm theo hành trình · Theo vai trò · Sự cố
import Link from 'next/link';
export type NavOn = 'hub' | 'journey' | 'library' | 'suco';
export default function GuideNav({ on, journeySlug, hasSuco = true }: { on: NavOn; journeySlug?: string | null; hasSuco?: boolean }) {
  const T: [NavOn, string, string, string][] = [
    ...(journeySlug ? [['hub', '/huong-dan', 'ri-compass-3-line', 'Tổng quan'] as [NavOn, string, string, string]] : []),
    ...(journeySlug ? [['journey', `/huong-dan/${journeySlug}`, 'ri-route-line', 'Làm theo hành trình'] as [NavOn, string, string, string]] : []),
    ['library', '/huong-dan/thu-vien', 'ri-book-2-line', 'Theo vai trò'],
    ...(journeySlug && hasSuco ? [['suco', '/huong-dan/su-co', 'ri-alarm-warning-line', 'Sự cố thường gặp'] as [NavOn, string, string, string]] : []),
  ];
  return (
    <nav className="hj-nav" aria-label="Chế độ xem hướng dẫn">
      {T.map(([k, h, ic, l]) => <Link key={k} href={h} data-on={on === k}><i className={ic} /> {l}</Link>)}
    </nav>
  );
}
