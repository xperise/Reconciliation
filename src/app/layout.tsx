import type { Metadata } from 'next';
import { Be_Vietnam_Pro, JetBrains_Mono, Fraunces } from 'next/font/google';
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

// Chỉ dùng cho đúng một chỗ: câu tóm tắt điều hành trên Dashboard. Dùng thêm
// chỗ khác là mất tín hiệu "đây là diễn giải, không phải số liệu thô".
const display = Fraunces({
  subsets: ['vietnamese', 'latin'],
  weight: ['500'],
  variable: '--font-display',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Đối soát bảng kê — xperise',
  description: 'Hệ thống vận hành đối soát bảng kê giữa xperise và khách hàng.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className={`${ui.variable} ${mono.variable} ${display.variable}`}>
      <body>{children}</body>
    </html>
  );
}
