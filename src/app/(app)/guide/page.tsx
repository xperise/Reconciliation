import { redirect } from 'next/navigation';

// Trang SOP cũ đã chuyển vào tab Hướng dẫn (Hệ thống nội bộ › Hệ thống đối soát bảng kê)
export default function GuidePage() {
  redirect('/huong-dan/doi-soat-bang-ke');
}
