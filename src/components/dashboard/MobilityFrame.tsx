"use client";
// Phần Mobility của tab Dashboard = dashboard XPAY (public/dashboard/mobility.html) chạy trong khung riêng.
// Khung cao vừa màn hình (phần dưới thanh tab), dashboard tự cuộn bên trong để các bảng/ngăn kéo nổi hiển thị đúng chỗ.
import { useEffect, useRef, useState } from "react";

// Đổi số này mỗi lần cập nhật public/dashboard/mobility.html để trình duyệt không dùng bản cũ
export const MOBILITY_BUILD = "20261021f";

export default function MobilityFrame({ reloadKey }: { reloadKey: number }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [h, setH] = useState(800);
  useEffect(() => {
    const fit = () => {
      const el = ref.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top + window.scrollY;
      setH(Math.max(480, window.innerHeight - top));
    };
    fit();
    const t = setTimeout(fit, 300);
    window.addEventListener("resize", fit);
    return () => { clearTimeout(t); window.removeEventListener("resize", fit); };
  }, []);
  return (
    <iframe
      key={reloadKey}
      ref={ref}
      title="Dashboard Mobility"
      src={`/dashboard/mobility.html?v=${MOBILITY_BUILD}`}
      style={{ display: "block", width: "100%", height: h, border: 0, background: "#f7f7fa" }}
    />
  );
}
