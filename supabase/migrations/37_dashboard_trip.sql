-- =====================================================================
-- 37_dashboard_trip.sql — Mã chuyến đi (Trip ID) trên bảng kê khách hàng (11/2026)
-- Chạy SAU 36_dashboard_ket_qua_noi.sql. Supabase → SQL Editor → Run. Chạy lại nhiều lần không sao.
-- Hotel và flight cùng một chuyến đi mang chung Trip ID → so sánh GMV kỳ này / kỳ trước do số chuyến hay giá trị mỗi chuyến.
-- =====================================================================
alter table fin_src_kh add column if not exists trip_id text;
create index if not exists fin_src_kh_trip_idx on fin_src_kh (trip_id);
