-- =====================================================================
-- 63_tuan_thu_tu_gui_theo_khach.sql — Tự gửi bảng kê theo từng khách
--   • tu_gui: khách này có bật tự gửi không (mặc định tắt).
--   • tu_gui_kiem_dinh_luc / _boi: lúc và người xác nhận đã kiểm định (CEO) rằng bảng kê tự động khớp.
--   • Additive. Mặc định mọi khách tắt tự gửi, nên hành vi không đổi.
-- Chạy SAU 62_tuan_thu_nhat_ky_lan_chay.sql.
-- =====================================================================

alter table tt_hop_dong add column if not exists tu_gui boolean not null default false;
alter table tt_hop_dong add column if not exists tu_gui_kiem_dinh_luc timestamptz null;
alter table tt_hop_dong add column if not exists tu_gui_kiem_dinh_boi uuid null;
