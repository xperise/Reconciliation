-- =====================================================================
-- 33_master_pm.sql — PM phụ trách khách hàng quản lý ở Master Data (tab Xperise) (11/2026)
-- Chạy SAU 32_dashboard_da_gui_bk.sql. Supabase → SQL Editor → Run. Chạy lại nhiều lần không sao.
-- PM ghi ở nhóm đối soát; pháp nhân nào khác PM của nhóm thì ghi riêng ở pháp nhân.
-- Dashboard Travel & SaaS lấy PM theo đây (pháp nhân → nhóm), không lấy từ file danh mục nữa.
-- =====================================================================
alter table billing_groups add column if not exists pm text;
alter table customers      add column if not exists pm text;
