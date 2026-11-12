"use client";
// Tab Workstream = ứng dụng Workstream Intelligence (public/workstream/index.html, chuyển từ repo
// xperise/Workstream-Dashboard) chạy trong khung riêng, giống phần Mobility của tab Dashboard.
// Khung cao vừa màn hình (phần dưới thanh trên cùng); ứng dụng tự cuộn bên trong.
import { useEffect, useRef, useState } from "react";

// Đổi số này mỗi lần cập nhật tệp trong public/workstream/ để trình duyệt không dùng bản cũ
export const WORKSTREAM_BUILD = "20261112a";

export default function WorkstreamFrame() {
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
      ref={ref}
      title="Workstream"
      src={`/workstream/index.html?v=${WORKSTREAM_BUILD}`}
      style={{ display: "block", width: "100%", height: h, border: 0, background: "#f7f7fa" }}
    />
  );
}
