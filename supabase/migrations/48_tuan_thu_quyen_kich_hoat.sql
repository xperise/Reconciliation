-- =====================================================================
-- 48_tuan_thu_quyen_kich_hoat.sql — Pha 1: quyền kích hoạt hợp đồng theo role
--   Thêm cột kich_hoat trên tt_role. Mặc định: chỉ CEO (đúng hành vi hiện tại).
--   Additive. Nếu chưa chạy file này, code dùng mặc định (chỉ CEO) nhờ dự phòng.
-- Chạy SAU 47_tuan_thu_cau_hinh_quy_trinh.sql.
-- =====================================================================

alter table tt_role add column if not exists kich_hoat boolean not null default false;
update tt_role set kich_hoat = true where key = 'ceo';
