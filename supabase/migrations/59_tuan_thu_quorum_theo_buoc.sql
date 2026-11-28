-- =====================================================================
-- 59_tuan_thu_quorum_theo_buoc.sql — Quorum sửa đổi theo phạm vi (chọn bước)
--   • sua_doi: bước này có tham gia quorum sửa đổi quy tắc hay không.
--     Mặc định true cho mọi bước hiện có → hành vi không đổi (cần đủ mọi role như trước).
--   • Additive. Chạy SAU 58_tuan_thu_chuoi_buoc_nhieu_nhom.sql.
-- =====================================================================

alter table tt_buoc_quy_trinh add column if not exists sua_doi boolean not null default true;
