-- =====================================================================
-- 35_dashboard_email_nguoi_dat.sql — Email người đặt trên bảng kê khách hàng (11/2026)
-- Chạy SAU 34_master_ten_khac.sql. Supabase → SQL Editor → Run. Chạy lại nhiều lần không sao.
-- Dòng bảng kê không ghi "Tên công ty" thì nhận khách theo tên miền email người đặt (vd. @scg.com → SCG).
-- =====================================================================
alter table fin_src_kh add column if not exists email text;
