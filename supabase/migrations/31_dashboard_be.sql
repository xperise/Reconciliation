-- =====================================================================
-- 31_dashboard_be.sql — Mảng Transportation (Be) trong Travel & SaaS (11/2026)
-- Chạy SAU 30_dashboard_nguon.sql. Supabase → SQL Editor → Run. Chạy lại nhiều lần không sao.
-- Bảng kê Be (Be_statement_<tên công ty>_<ngày>.xlsx) lưu vào fin_src_kh với loai = 'transport':
-- mỗi Session ID một dòng, GMV = tổng "Total amount" các dòng của session (cước phí + phụ phí).
-- =====================================================================
alter table fin_src_kh drop constraint if exists fin_src_kh_loai_check;
alter table fin_src_kh add constraint fin_src_kh_loai_check check (loai in ('hotel', 'flight', 'transport'));
create index if not exists fin_src_kh_cty_idx on fin_src_kh (loai, ten_cong_ty, ky);
