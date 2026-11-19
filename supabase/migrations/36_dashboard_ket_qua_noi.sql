-- =====================================================================
-- 36_dashboard_ket_qua_noi.sql — Lưu kết quả nối bảng kê ↔ nguồn giá vốn (11/2026)
-- Chạy SAU 35_dashboard_email_nguoi_dat.sql. Supabase → SQL Editor → Run. Chạy lại nhiều lần không sao.
-- Mỗi lần "Dựng lại GMV & giá vốn", web ghi vào từng dòng: khách, NCC, giá vốn phân bổ (bảng kê) và
-- khách được dùng / lý do không dùng (nguồn giá vốn) — để file master data đối soát qua lại được.
-- =====================================================================
alter table fin_src_kh  add column if not exists kh_ma     text;     -- mã khách dashboard nhận cho dòng
alter table fin_src_kh  add column if not exists ncc_ma    text;     -- NCC (đã gộp tên gọi khác)
alter table fin_src_kh  add column if not exists gia_von   numeric;  -- giá vốn phân bổ cho dòng (null = chưa có)
alter table fin_src_kh  add column if not exists nguon_gv  text;     -- Đối soát NCC / Giá NCC hệ thống
alter table fin_src_kh  add column if not exists ky_tinh   text;     -- kỳ tính số (sau quy lệch kỳ)
alter table fin_src_ncc add column if not exists kh_ma     text;     -- khách của dòng bảng kê đã nối
alter table fin_src_ncc add column if not exists gia_von_dung numeric; -- số đã dùng làm giá vốn (sau quy tỷ lệ)
alter table fin_src_ncc add column if not exists tt_noi    text;     -- tình trạng nối / lý do không dùng
