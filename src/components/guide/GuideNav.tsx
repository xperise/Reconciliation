// Chuyển giữa Hành trình và Thư viện trong tab Hướng dẫn
import Link from 'next/link';
export default function GuideNav({ on, journeySlug }: { on: 'journey' | 'library'; journeySlug?: string | null }) {
  return (
    <nav className="hj-nav" aria-label="Chế độ xem hướng dẫn">
      {journeySlug && <Link href="/huong-dan" data-on={on === 'journey'}><i className="ri-route-line" /> Hành trình</Link>}
      <Link href="/huong-dan/thu-vien" data-on={on === 'library'}><i className="ri-book-2-line" /> Thư viện</Link>
    </nav>
  );
}
