-- =====================================================================
-- 52_tuan_thu_rls_theo_to_chuc.sql — Bước 1c: RLS theo tổ chức
--   • Người dùng đăng nhập (vai trò authenticated) chỉ đọc/ghi dòng thuộc tổ chức của mình
--     (tra cứu qua tt_nguoi_to_chuc).
--   • Ứng dụng dùng khoá service role nên không bị ảnh hưởng: service role bỏ qua RLS.
--   • Additive: chỉ thêm policy; không đổi dữ liệu.
-- Chạy SAU 51_tuan_thu_nguoi_to_chuc.sql.
-- =====================================================================

-- Mỗi người chỉ thấy dòng liên kết của chính mình
drop policy if exists tt_nguoi_to_chuc_own on tt_nguoi_to_chuc;
create policy tt_nguoi_to_chuc_own on tt_nguoi_to_chuc
  for select to authenticated
  using (user_id = auth.uid());

-- Chỉ thấy tổ chức mình thuộc về
drop policy if exists tt_to_chuc_member on tt_to_chuc;
create policy tt_to_chuc_member on tt_to_chuc
  for select to authenticated
  using (id in (select org_id from tt_nguoi_to_chuc where user_id = auth.uid()));

drop policy if exists tt_ai_ket_qua_org on tt_ai_ket_qua;
create policy tt_ai_ket_qua_org on tt_ai_ket_qua
  for all to authenticated
  using (org_id in (select org_id from tt_nguoi_to_chuc where user_id = auth.uid()))
  with check (org_id in (select org_id from tt_nguoi_to_chuc where user_id = auth.uid()));

drop policy if exists tt_bo_quy_tac_org on tt_bo_quy_tac;
create policy tt_bo_quy_tac_org on tt_bo_quy_tac
  for all to authenticated
  using (org_id in (select org_id from tt_nguoi_to_chuc where user_id = auth.uid()))
  with check (org_id in (select org_id from tt_nguoi_to_chuc where user_id = auth.uid()));

drop policy if exists tt_buoc_quy_trinh_org on tt_buoc_quy_trinh;
create policy tt_buoc_quy_trinh_org on tt_buoc_quy_trinh
  for all to authenticated
  using (org_id in (select org_id from tt_nguoi_to_chuc where user_id = auth.uid()))
  with check (org_id in (select org_id from tt_nguoi_to_chuc where user_id = auth.uid()));

drop policy if exists tt_canh_bao_org on tt_canh_bao;
create policy tt_canh_bao_org on tt_canh_bao
  for all to authenticated
  using (org_id in (select org_id from tt_nguoi_to_chuc where user_id = auth.uid()))
  with check (org_id in (select org_id from tt_nguoi_to_chuc where user_id = auth.uid()));

drop policy if exists tt_chan_org on tt_chan;
create policy tt_chan_org on tt_chan
  for all to authenticated
  using (org_id in (select org_id from tt_nguoi_to_chuc where user_id = auth.uid()))
  with check (org_id in (select org_id from tt_nguoi_to_chuc where user_id = auth.uid()));

drop policy if exists tt_chat_org on tt_chat;
create policy tt_chat_org on tt_chat
  for all to authenticated
  using (org_id in (select org_id from tt_nguoi_to_chuc where user_id = auth.uid()))
  with check (org_id in (select org_id from tt_nguoi_to_chuc where user_id = auth.uid()));

drop policy if exists tt_duyet_org on tt_duyet;
create policy tt_duyet_org on tt_duyet
  for all to authenticated
  using (org_id in (select org_id from tt_nguoi_to_chuc where user_id = auth.uid()))
  with check (org_id in (select org_id from tt_nguoi_to_chuc where user_id = auth.uid()));

drop policy if exists tt_hanh_dong_org on tt_hanh_dong;
create policy tt_hanh_dong_org on tt_hanh_dong
  for all to authenticated
  using (org_id in (select org_id from tt_nguoi_to_chuc where user_id = auth.uid()))
  with check (org_id in (select org_id from tt_nguoi_to_chuc where user_id = auth.uid()));

drop policy if exists tt_hop_dong_org on tt_hop_dong;
create policy tt_hop_dong_org on tt_hop_dong
  for all to authenticated
  using (org_id in (select org_id from tt_nguoi_to_chuc where user_id = auth.uid()))
  with check (org_id in (select org_id from tt_nguoi_to_chuc where user_id = auth.uid()));

drop policy if exists tt_lan_chay_org on tt_lan_chay;
create policy tt_lan_chay_org on tt_lan_chay
  for all to authenticated
  using (org_id in (select org_id from tt_nguoi_to_chuc where user_id = auth.uid()))
  with check (org_id in (select org_id from tt_nguoi_to_chuc where user_id = auth.uid()));

drop policy if exists tt_mau_bang_ke_org on tt_mau_bang_ke;
create policy tt_mau_bang_ke_org on tt_mau_bang_ke
  for all to authenticated
  using (org_id in (select org_id from tt_nguoi_to_chuc where user_id = auth.uid()))
  with check (org_id in (select org_id from tt_nguoi_to_chuc where user_id = auth.uid()));

drop policy if exists tt_phong_ban_khach_org on tt_phong_ban_khach;
create policy tt_phong_ban_khach_org on tt_phong_ban_khach
  for all to authenticated
  using (org_id in (select org_id from tt_nguoi_to_chuc where user_id = auth.uid()))
  with check (org_id in (select org_id from tt_nguoi_to_chuc where user_id = auth.uid()));

drop policy if exists tt_quy_tac_org on tt_quy_tac;
create policy tt_quy_tac_org on tt_quy_tac
  for all to authenticated
  using (org_id in (select org_id from tt_nguoi_to_chuc where user_id = auth.uid()))
  with check (org_id in (select org_id from tt_nguoi_to_chuc where user_id = auth.uid()));

drop policy if exists tt_role_org on tt_role;
create policy tt_role_org on tt_role
  for all to authenticated
  using (org_id in (select org_id from tt_nguoi_to_chuc where user_id = auth.uid()))
  with check (org_id in (select org_id from tt_nguoi_to_chuc where user_id = auth.uid()));

drop policy if exists tt_skill_org on tt_skill;
create policy tt_skill_org on tt_skill
  for all to authenticated
  using (org_id in (select org_id from tt_nguoi_to_chuc where user_id = auth.uid()))
  with check (org_id in (select org_id from tt_nguoi_to_chuc where user_id = auth.uid()));

drop policy if exists tt_skill_goi_y_org on tt_skill_goi_y;
create policy tt_skill_goi_y_org on tt_skill_goi_y
  for all to authenticated
  using (org_id in (select org_id from tt_nguoi_to_chuc where user_id = auth.uid()))
  with check (org_id in (select org_id from tt_nguoi_to_chuc where user_id = auth.uid()));

drop policy if exists tt_sua_doi_org on tt_sua_doi;
create policy tt_sua_doi_org on tt_sua_doi
  for all to authenticated
  using (org_id in (select org_id from tt_nguoi_to_chuc where user_id = auth.uid()))
  with check (org_id in (select org_id from tt_nguoi_to_chuc where user_id = auth.uid()));

drop policy if exists tt_sua_doi_duyet_org on tt_sua_doi_duyet;
create policy tt_sua_doi_duyet_org on tt_sua_doi_duyet
  for all to authenticated
  using (org_id in (select org_id from tt_nguoi_to_chuc where user_id = auth.uid()))
  with check (org_id in (select org_id from tt_nguoi_to_chuc where user_id = auth.uid()));

drop policy if exists tt_sua_tay_org on tt_sua_tay;
create policy tt_sua_tay_org on tt_sua_tay
  for all to authenticated
  using (org_id in (select org_id from tt_nguoi_to_chuc where user_id = auth.uid()))
  with check (org_id in (select org_id from tt_nguoi_to_chuc where user_id = auth.uid()));

drop policy if exists tt_tep_lan_chay_org on tt_tep_lan_chay;
create policy tt_tep_lan_chay_org on tt_tep_lan_chay
  for all to authenticated
  using (org_id in (select org_id from tt_nguoi_to_chuc where user_id = auth.uid()))
  with check (org_id in (select org_id from tt_nguoi_to_chuc where user_id = auth.uid()));

drop policy if exists tt_thanh_vien_org on tt_thanh_vien;
create policy tt_thanh_vien_org on tt_thanh_vien
  for all to authenticated
  using (org_id in (select org_id from tt_nguoi_to_chuc where user_id = auth.uid()))
  with check (org_id in (select org_id from tt_nguoi_to_chuc where user_id = auth.uid()));

drop policy if exists tt_thay_doi_org on tt_thay_doi;
create policy tt_thay_doi_org on tt_thay_doi
  for all to authenticated
  using (org_id in (select org_id from tt_nguoi_to_chuc where user_id = auth.uid()))
  with check (org_id in (select org_id from tt_nguoi_to_chuc where user_id = auth.uid()));
