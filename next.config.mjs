/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: { bodySizeLimit: '25mb' },
    // Mặc định Next giữ kết quả trang động 30 giây trong bộ nhớ trình duyệt,
    // nên chuyển tab qua lại vẫn thấy số cũ cho tới khi tự bấm tải lại. Với
    // công cụ vận hành thì dữ liệu phải luôn là mới nhất.
    staleTimes: { dynamic: 0, static: 0 },
  },
};
export default nextConfig;
