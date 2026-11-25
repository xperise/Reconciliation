-- =====================================================================
-- 45_tuan_thu_bang_ke_da_format.sql — Lần chạy từ BẢNG KÊ KẾ TOÁN ĐÃ FORMAT
--   Kế toán upload bảng kê đã format (raw đối chiếu: không bắt buộc) → app kiểm tra theo bộ quy tắc
--   → tạo thêm "bản đã sửa theo quy tắc" (vá đúng ô trong file, giữ mẫu) → kế toán chọn bản gửi
--   → CEO duyệt là gửi đúng bản đã chọn.
-- Chạy SAU 44_tuan_thu_chat_dinh_kem.sql.
-- =====================================================================

alter table tt_lan_chay add column if not exists che_do text not null default 'raw';
alter table tt_lan_chay drop constraint if exists tt_lan_chay_che_do_check;
alter table tt_lan_chay add constraint tt_lan_chay_che_do_check check (che_do in ('raw','da_format'));
alter table tt_lan_chay add column if not exists bk_goc_path text;    -- bảng kê kế toán upload
alter table tt_lan_chay add column if not exists bk_goc_ten text;
alter table tt_lan_chay add column if not exists bk_sua_path text;    -- bản đã sửa theo quy tắc (nếu có thay đổi)
alter table tt_lan_chay add column if not exists ban_gui text;
alter table tt_lan_chay drop constraint if exists tt_lan_chay_ban_gui_check;
alter table tt_lan_chay add constraint tt_lan_chay_ban_gui_check check (ban_gui is null or ban_gui in ('goc','da_sua'));
