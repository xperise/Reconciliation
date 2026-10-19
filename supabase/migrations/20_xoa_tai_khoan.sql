-- =====================================================================
-- 20_xoa_tai_khoan.sql — Cho phép xoá hẳn một tài khoản người dùng
--
-- Vì sao cần: nhiều bảng trỏ tới profiles(id) mà không khai ON DELETE, nên
-- Postgres chặn xoá bất kỳ ai đã từng duyệt bảng kê, tải tệp hay có dòng
-- nhật ký. Đổi các khoá ngoại đó sang ON DELETE SET NULL: dữ liệu lịch sử
-- giữ nguyên, chỉ bỏ liên kết tới người đã bị xoá.
--
-- An toàn khi chạy lại nhiều lần.
-- =====================================================================

do $$
declare
  r record;
begin
  for r in
    select
      con.conname,
      cl.relname  as bang,
      att.attname as cot
    from pg_constraint con
    join pg_class      cl  on cl.oid = con.conrelid
    join pg_namespace  ns  on ns.oid = cl.relnamespace
    join pg_class      ref on ref.oid = con.confrelid
    join pg_attribute  att on att.attrelid = con.conrelid
                          and att.attnum = con.conkey[1]
    where con.contype = 'f'
      and ns.nspname  = 'public'
      and ref.relname = 'profiles'
      and con.confdeltype = 'a'          -- 'a' = NO ACTION, tức đang chặn xoá
      and array_length(con.conkey, 1) = 1
      and not att.attnotnull             -- chỉ đổi được cột cho phép NULL
  loop
    execute format('alter table public.%I drop constraint %I', r.bang, r.conname);
    execute format(
      'alter table public.%I add constraint %I foreign key (%I) references public.profiles(id) on delete set null',
      r.bang, r.conname, r.cot);
    raise notice 'Đã mở khoá xoá cho %.%', r.bang, r.cot;
  end loop;
end $$;

-- Cột quyền xem Dashboard (phòng khi chưa chạy 14_dashboard_tai_chinh.sql)
alter table public.profiles
  add column if not exists xem_dashboard boolean not null default false;

-- Bỏ ràng buộc "phải có ít nhất Xperise hoặc MLX" của bản 13: giờ chỉ cấp
-- mỗi Dashboard cũng là cấu hình hợp lệ.
alter table public.profiles drop constraint if exists profiles_it_nhat_mot_tab;
alter table public.profiles
  add constraint profiles_it_nhat_mot_tab
  check (xem_xperise or xem_mlx or xem_dashboard);
