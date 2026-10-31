"use client";
// Phần Mobility của tab Dashboard = dashboard XPAY (public/dashboard/mobility.html) chạy trong khung riêng.
// Khung cao vừa màn hình (phần dưới thanh tab), dashboard tự cuộn bên trong để các bảng/ngăn kéo nổi hiển thị đúng chỗ.
// Đường dẫn: /dashboard/mobility/<tab> — khung báo tab đang mở lên (postMessage) để cập nhật thanh địa chỉ;
// mở link / bấm Back thì gửi xuống để khung chuyển đúng tab, không tải lại.
import { useEffect, useRef, useState } from "react";

// Đổi số này mỗi lần cập nhật public/dashboard/mobility.html để trình duyệt không dùng bản cũ
export const MOBILITY_BUILD = "20261031b";

export default function MobilityFrame({ reloadKey, initialPath = "", initialKh = "" }: { reloadKey: number; initialPath?: string; initialKh?: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [h, setH] = useState(800);
  // đường dẫn ban đầu chỉ dùng lúc tạo khung — đổi tab sau đó không tải lại khung
  const [start] = useState(() => `#r=${encodeURIComponent(initialPath)}${initialKh ? `&kh=${encodeURIComponent(initialKh)}` : ""}`);
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
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== location.origin || e.source !== ref.current?.contentWindow) return;
      const d = e.data as { type?: string; path?: string; kh?: string; push?: boolean };
      if (d?.type !== "xpay-route") return;
      const url = `/dashboard/mobility${d.path ? "/" + d.path : ""}${d.kh ? `?kh=${encodeURIComponent(d.kh)}` : ""}`;
      if (location.pathname + location.search === url) return;
      if (d.push) history.pushState(null, "", url); else history.replaceState(null, "", url);
    };
    const onPop = () => {
      if (!location.pathname.startsWith("/dashboard/mobility")) return;
      const path = location.pathname.replace(/^\/dashboard\/mobility\/?/, ""), kh = new URLSearchParams(location.search).get("kh") ?? "";
      ref.current?.contentWindow?.postMessage({ type: "xpay-go", path, kh }, location.origin);
    };
    window.addEventListener("message", onMsg);
    window.addEventListener("popstate", onPop);
    return () => { window.removeEventListener("message", onMsg); window.removeEventListener("popstate", onPop); };
  }, []);
  return (
    <iframe
      key={reloadKey}
      ref={ref}
      title="Dashboard Mobility"
      src={`/dashboard/mobility.html?v=${MOBILITY_BUILD}${start}`}
      style={{ display: "block", width: "100%", height: h, border: 0, background: "#f7f7fa" }}
    />
  );
}
