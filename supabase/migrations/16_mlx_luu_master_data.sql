-- =====================================================================
-- 16_mlx_luu_master_data.sql
-- Lưu toàn bộ master data MLX trong MỘT giao dịch duy nhất.
--
-- Vì sao cần: cách cũ gửi nhiều lệnh rời (xoá → upsert → insert). Khi dán đè
-- một danh sách đã sắp xếp khác, tên công ty bị xê dịch giữa các dòng cũ, nên
-- GIỮA CHỪNG lệnh upsert có hai dòng tạm thời cùng tên → Postgres báo
-- "duplicate key value violates unique constraint mlx_customers_ten_cong_ty_uq"
-- dù danh sách cuối cùng không hề trùng. Lỗi xảy ra SAU khi lệnh xoá đã chạy,
-- nên dữ liệu có thể mất một phần.
--
-- Cách làm ở đây: đổi tên tạm cho các dòng sắp đổi tên, rồi mới ghi tên thật.
-- Toàn bộ nằm trong một hàm nên hoặc thành công hết, hoặc không đổi gì.
--
-- Chạy sau 11_mlx_customers.sql. An toàn khi chạy lại nhiều lần.
-- =====================================================================

create or replace function public.mlx_luu_master_data(
  payload  jsonb,            -- danh sách khách hàng muốn lưu (trạng thái cuối cùng)
  ban_dau  uuid[] default '{}'  -- id đã tải lên màn hình; chỉ xoá trong phạm vi này
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  so_xoa  int := 0;
  so_sua  int := 0;
  so_them int := 0;
  ten_trung text;
begin
  create temp table _mlx_payload on commit drop as
  select
    r.id,
    btrim(coalesce(r.ma_khach_hang, '')) as ma_khach_hang,
    btrim(coalesce(r.ma_hop_dong,   '')) as ma_hop_dong,
    btrim(coalesce(r.ten_cong_ty,   '')) as ten_cong_ty,
    btrim(coalesce(r.ten_viet_tat,  '')) as ten_viet_tat,
    btrim(coalesce(r.dia_chi,       '')) as dia_chi,
    btrim(coalesce(r.mst,           '')) as mst,
    coalesce(r.chiet_khau, 0)            as chiet_khau
  from jsonb_to_recordset(payload) as r(
    id uuid, ma_khach_hang text, ma_hop_dong text, ten_cong_ty text,
    ten_viet_tat text, dia_chi text, mst text, chiet_khau numeric
  );

  -- ---- Kiểm tra dữ liệu trước khi đụng vào bảng thật ------------------
  if exists (select 1 from _mlx_payload where ten_cong_ty = '') then
    raise exception 'Có dòng thiếu tên công ty.';
  end if;

  if exists (select 1 from _mlx_payload where chiet_khau < 0 or chiet_khau > 100) then
    raise exception '%% chiết khấu phải là số từ 0 đến 100.';
  end if;

  select string_agg(ten_cong_ty, ' | ') into ten_trung
  from (
    select min(ten_cong_ty) as ten_cong_ty
    from _mlx_payload
    group by lower(ten_cong_ty)
    having count(*) > 1
    limit 5
  ) t;
  if ten_trung is not null then
    raise exception 'Trùng tên công ty trong danh sách: %', ten_trung;
  end if;

  -- ---- 1) Xoá khách đã bị bỏ khỏi danh sách --------------------------
  -- Chỉ xoá trong phạm vi id đã tải lên màn hình, để không đụng vào dòng
  -- người khác vừa thêm trong lúc đang sửa.
  with da_xoa as (
    delete from mlx_customers c
     where c.id = any(ban_dau)
       and not exists (select 1 from _mlx_payload p where p.id = c.id)
    returning 1
  ) select count(*) into so_xoa from da_xoa;

  -- ---- 2) Đổi tên tạm cho những dòng sắp đổi tên ----------------------
  -- Bước này gỡ đụng độ unique khi tên bị hoán đổi giữa các dòng.
  update mlx_customers c
     set ten_cong_ty = '§tmp§' || c.id::text
    from _mlx_payload p
   where p.id = c.id
     and lower(c.ten_cong_ty) is distinct from lower(p.ten_cong_ty);

  -- ---- 3) Ghi dữ liệu thật cho dòng cũ --------------------------------
  with da_sua as (
    update mlx_customers c set
      ma_khach_hang = p.ma_khach_hang,
      ma_hop_dong   = p.ma_hop_dong,
      ten_cong_ty   = p.ten_cong_ty,
      ten_viet_tat  = p.ten_viet_tat,
      dia_chi       = p.dia_chi,
      mst           = p.mst,
      chiet_khau    = p.chiet_khau
    from _mlx_payload p
    where p.id = c.id
    returning 1
  ) select count(*) into so_sua from da_sua;

  -- ---- 4) Thêm dòng mới ----------------------------------------------
  -- Dòng mang sẵn id (ví dụ bản ghi bị xoá ở nơi khác trong lúc đang sửa)
  -- được thêm lại đúng id cũ, để lịch sử bảng kê không mất liên kết khách.
  with da_them as (
    insert into mlx_customers as c
      (id, ma_khach_hang, ma_hop_dong, ten_cong_ty, ten_viet_tat, dia_chi, mst, chiet_khau)
    select coalesce(p.id, gen_random_uuid()),
           p.ma_khach_hang, p.ma_hop_dong, p.ten_cong_ty,
           p.ten_viet_tat, p.dia_chi, p.mst, p.chiet_khau
    from _mlx_payload p
    where not exists (select 1 from mlx_customers x where x.id = p.id)
    returning 1
  ) select count(*) into so_them from da_them;

  drop table if exists _mlx_payload;

  return jsonb_build_object('xoa', so_xoa, 'sua', so_sua, 'them', so_them);
end $$;

comment on function public.mlx_luu_master_data(jsonb, uuid[]) is
  'Lưu master data MLX trong một giao dịch; đổi tên tạm để tránh đụng độ unique khi tên xê dịch giữa các dòng.';

grant execute on function public.mlx_luu_master_data(jsonb, uuid[]) to authenticated;
