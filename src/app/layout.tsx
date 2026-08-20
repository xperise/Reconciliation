import type { Metadata } from 'next';
import { Be_Vietnam_Pro, JetBrains_Mono } from 'next/font/google';
import './globals.css';

// Be Vietnam Pro dựng riêng cho dấu tiếng Việt — dấu ngã, dấu hỏi và mũ
// không bị chèn nhau ở cỡ chữ nhỏ của bảng dữ liệu.
const body = Be_Vietnam_Pro({
  subsets: ['vietnamese', 'latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-body',
  display: 'swap',
});

const mono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Đối soát bảng kê — xperise',
  description: 'Hệ thống vận hành đối soát bảng kê giữa xperise và khách hàng.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className={`${body.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
