-- =====================================================================
-- 56_tuan_thu_cau_hinh_theo_to_chuc.sql — Khoá role và bước theo tổ chức
--   • tt_role và tt_buoc_quy_trinh: khoá chính (org_id, key) thay cho key toàn cục,
--     để mỗi tổ chức có mã role riêng (hai tổ chức cùng có "ke_toan" không xung đột).
--   • Các khoá ngoại tới tt_role chuyển sang (org_id, mã role) để không tham chiếu chéo tổ chức.
--   • Additive về dữ liệu: không đổi giá trị hiện có. Chạy SAU 55.
-- =====================================================================

-- 1) Bỏ các khoá ngoại cũ trỏ tới tt_role(key) (tên theo mặc định của Postgres / migration 49, 47, 55)
alter table tt_thanh_vien       drop constraint if exists tt_thanh_vien_phong_ban_fk;
alter table tt_quy_tac          drop constraint if exists tt_quy_tac_phong_ban_fk;
alter table tt_skill            drop constraint if exists tt_skill_phong_ban_fk;
alter table tt_chan             drop constraint if exists tt_chan_phong_ban_fk;
alter table tt_loi_moi          drop constraint if exists tt_loi_moi_phong_ban_fkey;
alter table tt_buoc_quy_trinh   drop constraint if exists tt_buoc_quy_trinh_role_key_fkey;

-- 2) Khoá chính theo tổ chức
alter table tt_role drop constraint if exists tt_role_pkey;
alter table tt_role add primary key (org_id, key);

alter table tt_buoc_quy_trinh drop constraint if exists tt_buoc_quy_trinh_pkey;
alter table tt_buoc_quy_trinh add primary key (org_id, key);

-- 3) Khoá ngoại theo tổ chức
alter table tt_thanh_vien     add constraint tt_thanh_vien_role_fk     foreign key (org_id, phong_ban) references tt_role (org_id, key);
alter table tt_quy_tac        add constraint tt_quy_tac_role_fk        foreign key (org_id, phong_ban) references tt_role (org_id, key);
alter table tt_skill          add constraint tt_skill_role_fk          foreign key (org_id, phong_ban) references tt_role (org_id, key);
alter table tt_chan           add constraint tt_chan_role_fk           foreign key (org_id, phong_ban) references tt_role (org_id, key);
alter table tt_loi_moi        add constraint tt_loi_moi_role_fk        foreign key (org_id, phong_ban) references tt_role (org_id, key);
alter table tt_buoc_quy_trinh add constraint tt_buoc_quy_trinh_role_fk foreign key (org_id, role_key) references tt_role (org_id, key);
