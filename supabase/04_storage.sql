-- =====================================================================
-- 04_storage.sql — kho tệp. Chạy sau 03_seed_and_views.sql
--
-- Bucket để chế độ riêng tư: không ai mở được bằng đường dẫn trực tiếp.
-- Website phát hành liên kết có chữ ký, hết hạn sau một thời gian định trước.
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'bang-ke',
  'bang-ke',
  false,
  52428800,   -- 50 MB mỗi tệp
  array[
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'application/pdf',
    'application/zip',
    'application/x-zip-compressed'
  ]
)
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------
-- Phân quyền trên kho tệp
-- ---------------------------------------------------------------------

create or replace function storage_role() returns user_role
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid() and is_active
$$;

-- Ai đã đăng nhập cũng xem được, để PM và cấp quản lý đối chiếu khi cần
create policy "nguoi dung noi bo doc tep"
  on storage.objects for select
  using (bucket_id = 'bang-ke' and auth.uid() is not null);

create policy "ke toan tai tep len"
  on storage.objects for insert
  with check (
    bucket_id = 'bang-ke'
    and storage_role() in ('admin', 'ke_toan')
  );

create policy "ke toan ghi de tep"
  on storage.objects for update
  using (bucket_id = 'bang-ke' and storage_role() in ('admin', 'ke_toan'));

create policy "ke toan xoa tep"
  on storage.objects for delete
  using (bucket_id = 'bang-ke' and storage_role() in ('admin', 'ke_toan'));
