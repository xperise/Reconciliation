-- =====================================================================
-- 58_tuan_thu_chuoi_buoc_nhieu_nhom.sql — Bước 1 của cấu hình tuỳ ý (mô hình dữ liệu)
--   • nhom: bước thuộc nhóm nào. Cùng nhóm = chạy song song; khác nhóm = tuần tự.
--   • nguoi: người duyệt cụ thể của bước (để trống = theo role).
--   • che_do: đã có (mode); thêm giá trị 'tat_ca' và 'da_so' ở bước sau khi engine hỗ trợ.
--   • Additive. Dữ liệu hiện có: nhom = thu_tu.
-- Chạy SAU 57_tuan_thu_ghim_skill.sql.
-- =====================================================================

alter table tt_buoc_quy_trinh add column if not exists nhom int;
update tt_buoc_quy_trinh set nhom = thu_tu where nhom is null;
alter table tt_buoc_quy_trinh alter column nhom set not null;

alter table tt_buoc_quy_trinh add column if not exists nguoi uuid null;
