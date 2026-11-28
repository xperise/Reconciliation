-- =====================================================================
-- 57_tuan_thu_ghim_skill.sql — Ghim phiên bản skill vào lần chạy
--   • tt_lan_chay.skill_phien_ban: {mã phòng ban: số phiên bản skill} tại lúc tạo lần chạy.
--   • Agent của lần chạy đọc đúng phiên bản đã ghim; skill đổi giữa chừng không làm đổi lần đang mở.
--   • Additive. Lần chạy cũ (chưa có ghim) dùng bản mới nhất như trước.
-- Chạy SAU 56_tuan_thu_cau_hinh_theo_to_chuc.sql.
-- =====================================================================

alter table tt_lan_chay add column if not exists skill_phien_ban jsonb not null default '{}'::jsonb;
