-- =====================================================================
-- 02_rls.sql — Row Level Security. Chạy sau 01_schema.sql
--
-- Nguyên tắc: mọi người đã đăng nhập đều ĐỌC được dữ liệu vận hành.
-- Quyền GHI phân theo vai trò. Riêng app_settings chỉ admin thấy —
-- bảng này chứa refresh token Google.
-- Các workflow chạy bằng service_role key nên bỏ qua toàn bộ RLS.
-- =====================================================================

alter table profiles            enable row level security;
alter table billing_groups      enable row level security;
alter table customers           enable row level security;
alter table tracking            enable row level security;
alter table statement_files     enable row level security;
alter table status_log          enable row level security;
alter table workflow_schedules  enable row level security;
alter table workflow_runs       enable row level security;
alter table audit_log           enable row level security;
alter table app_settings        enable row level security;

-- Helper: vai trò của người đang đăng nhập
create or replace function current_role_name() returns user_role
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid() and is_active
$$;

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(current_role_name() = 'admin', false)
$$;

-- ---- profiles --------------------------------------------------------
create policy "doc ho so cua minh va cua nguoi khac"
  on profiles for select using (auth.uid() is not null);

create policy "tu sua ten cua minh"
  on profiles for update using (id = auth.uid()) with check (id = auth.uid());

create policy "admin toan quyen ho so"
  on profiles for all using (is_admin()) with check (is_admin());

-- ---- billing_groups & customers (Master Data) ------------------------
create policy "moi nguoi doc nhom doi soat"
  on billing_groups for select using (auth.uid() is not null);

create policy "ke toan va admin sua nhom doi soat"
  on billing_groups for all
  using (current_role_name() in ('admin', 'ke_toan'))
  with check (current_role_name() in ('admin', 'ke_toan'));

create policy "moi nguoi doc phap nhan"
  on customers for select using (auth.uid() is not null);

create policy "ke toan va admin sua phap nhan"
  on customers for all
  using (current_role_name() in ('admin', 'ke_toan'))
  with check (current_role_name() in ('admin', 'ke_toan'));

-- ---- tracking --------------------------------------------------------
create policy "moi nguoi doc tracking"
  on tracking for select using (auth.uid() is not null);

-- PM được override trạng thái theo SOP mục 6.1; kế toán sửa ghi chú & duyệt
create policy "ke toan pm admin sua tracking"
  on tracking for update
  using (current_role_name() in ('admin', 'ke_toan', 'pm'))
  with check (current_role_name() in ('admin', 'ke_toan', 'pm'));

create policy "admin them tracking"
  on tracking for insert with check (current_role_name() in ('admin', 'ke_toan'));

-- ---- statement_files -------------------------------------------------
create policy "moi nguoi doc danh sach tep"
  on statement_files for select using (auth.uid() is not null);

create policy "ke toan va admin tai tep len"
  on statement_files for insert
  with check (current_role_name() in ('admin', 'ke_toan'));

create policy "ke toan va admin sua tep"
  on statement_files for update
  using (current_role_name() in ('admin', 'ke_toan'))
  with check (current_role_name() in ('admin', 'ke_toan'));

create policy "ke toan va admin xoa tep chua gui"
  on statement_files for delete
  using (current_role_name() in ('admin', 'ke_toan') and sent_at is null);

-- ---- status_log & audit_log (chỉ đọc từ phía web) --------------------
create policy "moi nguoi doc lich su trang thai"
  on status_log for select using (auth.uid() is not null);

create policy "moi nguoi doc audit log"
  on audit_log for select using (auth.uid() is not null);

-- ---- workflow --------------------------------------------------------
create policy "moi nguoi doc cau hinh workflow"
  on workflow_schedules for select using (auth.uid() is not null);

create policy "admin sua cau hinh workflow"
  on workflow_schedules for all using (is_admin()) with check (is_admin());

create policy "moi nguoi doc lich su chay"
  on workflow_runs for select using (auth.uid() is not null);

-- ---- app_settings ----------------------------------------------------
create policy "chi admin doc cai dat"
  on app_settings for select using (is_admin());

create policy "chi admin sua cai dat"
  on app_settings for all using (is_admin()) with check (is_admin());
