-- =====================================================================
-- 49_tuan_thu_ma_role_chuan.sql — Pha 1: mã role là chuỗi, phải ở dạng chuẩn
--   • tt_role.key: chỉ chữ thường a–z, số, gạch dưới (ví dụ ke_toan).
--   • Các bảng dùng phong_ban: bỏ CHECK cố định 4 giá trị, thay bằng khoá ngoại tới tt_role(key).
--     Nhờ vậy thêm role mới trong tt_role là đủ; role không tồn tại bị DB từ chối.
--   • Trùng (hoa/thường, dấu, dấu cách, gạch dưới) được chặn ở code (cau-hinh.ts: kiemTraCauHinh).
-- Additive về dữ liệu: không đổi giá trị hiện có. Chạy SAU 48.
-- =====================================================================

alter table tt_role drop constraint if exists tt_role_key_chuan;
alter table tt_role add constraint tt_role_key_chuan check (key ~ '^[a-z0-9]+(_[a-z0-9]+)*$');

alter table tt_thanh_vien drop constraint if exists tt_thanh_vien_phong_ban_check;
alter table tt_thanh_vien add constraint tt_thanh_vien_phong_ban_fk foreign key (phong_ban) references tt_role(key);

alter table tt_quy_tac drop constraint if exists tt_quy_tac_phong_ban_check;
alter table tt_quy_tac add constraint tt_quy_tac_phong_ban_fk foreign key (phong_ban) references tt_role(key);

alter table tt_skill drop constraint if exists tt_skill_phong_ban_check;
alter table tt_skill add constraint tt_skill_phong_ban_fk foreign key (phong_ban) references tt_role(key);

alter table tt_chan drop constraint if exists tt_chan_phong_ban_check;
alter table tt_chan add constraint tt_chan_phong_ban_fk foreign key (phong_ban) references tt_role(key);
