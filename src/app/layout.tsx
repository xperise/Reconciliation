import type { Metadata } from 'next';
import { Be_Vietnam_Pro, JetBrains_Mono } from 'next/font/google';
import './globals.css';

// Be Vietnam Pro dựng riêng cho dấu tiếng Việt — dấu ngã và dấu hỏi không
// chèn nhau ở cỡ chữ 12–13px của bảng dữ liệu.
const ui = Be_Vietnam_Pro({
  subsets: ['vietnamese', 'latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-ui',
  display: 'swap',
});

// Mọi con số trên trang đi qua face này để cột số thẳng hàng khi cuộn.
const mono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-mono',
  display: 'swap',
});

// Không dùng font serif cho câu tóm tắt nữa. Fraunces dựng dấu tiếng Việt sai
// — "chốt" hiện thành "chô't" vì dấu sắc không chồng lên dấu mũ. Câu tóm tắt
// chuyển sang dùng chính Be Vietnam Pro, phân biệt bằng cỡ chữ và màu nền.

export const metadata: Metadata = {
  title: 'Đối soát bảng kê — xperise',
  description: 'Hệ thống vận hành đối soát bảng kê giữa xperise và khách hàng.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className={`${ui.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
