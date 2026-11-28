-- =====================================================================
-- 65_tuan_thu_bo_qua_va_sua_truc_tiep.sql
--   • tt_canh_bao.bo_qua*: kế toán bỏ qua một cảnh báo mức giải trình (có lý do, có người và thời điểm).
--     Cảnh báo chặn gửi không bỏ qua được. Cảnh báo bỏ qua vẫn tính là ngoại lệ (không tự gửi).
--   • tt_quorum_loai.can_duyet: loại thay đổi có cần duyệt không. false = áp dụng ngay, không qua quorum.
--     Mặc định true cho mọi loại hiện có → hành vi không đổi.
-- Chạy SAU 64_tuan_thu_thu_vien_hub.sql.
-- =====================================================================

alter table tt_canh_bao add column if not exists bo_qua boolean not null default false;
alter table tt_canh_bao add column if not exists bo_qua_ly_do text null;
alter table tt_canh_bao add column if not exists bo_qua_boi uuid null;
alter table tt_canh_bao add column if not exists bo_qua_luc timestamptz null;

alter table tt_quorum_loai add column if not exists can_duyet boolean not null default true;
