-- =====================================================================
-- 15_dashboard_bo_sung.sql — Bổ sung cho Dashboard quản trị
-- Chạy SAU 14_dashboard_tai_chinh.sql. Supabase → SQL Editor → Run.
-- Chạy lại nhiều lần không mất dữ liệu.
-- =====================================================================

-- 1) Theo dõi tiến độ bảng kê & thu tiền của công nợ phải thu
alter table fin_ar add column if not exists ngay_gui_bk       date;
alter table fin_ar add column if not exists ngay_thu_gan_nhat date;

-- 2) Sổ xử lý cảnh báo — ai nhận việc, hạn xử lý, đã làm gì, xong chưa.
--    id là mã ổn định do web sinh từ (kỳ + lĩnh vực + nội dung cảnh báo),
--    nên cùng một cảnh báo ở các lần mở trang khác nhau vẫn giữ nguyên ghi chú.
create table if not exists fin_alert_actions (
  id         text primary key,
  ky         text not null,
  pic        text,
  han_xu_ly  date,
  hanh_dong  text,
  trang_thai text not null default 'moi' check (trang_thai in ('moi','dang_xu_ly','da_xong','bo_qua')),
  updated_at timestamptz not null default now()
);
create index if not exists fin_alert_actions_ky_idx on fin_alert_actions (ky);

alter table fin_alert_actions enable row level security;
