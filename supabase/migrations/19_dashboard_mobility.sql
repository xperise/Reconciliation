-- =====================================================================
-- 19_dashboard_mobility.sql — Dashboard Mobility (XPAY CEO Dashboard)
-- Chạy SAU 18_dashboard_ceo.sql. Supabase → SQL Editor → Run.
-- Chạy lại nhiều lần không mất dữ liệu.
--
-- Phần Mobility trong tab Dashboard thay bằng dashboard XPAY (5 tab: Tổng quan,
-- Lộ trình 60 tỷ, Tiến độ khách hàng, Pattern di chuyển, Cập nhật số liệu).
--   · mob_state: toàn bộ số liệu của dashboard (1 dòng 'main', dạng JSON) —
--     ghi khi bấm "Lưu & cập nhật dashboard" ở tab Cập nhật số liệu hoặc khi
--     admin nhập file dữ liệu. Cột version chống hai người lưu đè nhau.
--   · mob_db: dữ liệu CS/Sales nhập hằng ngày ở tab Tiến độ khách hàng
--     (gọi khách, meeting, kết quả, PIC…). Mỗi dòng là một "tài liệu" theo đường dẫn
--     dạng crm/b07, cfg/main.
-- Các bảng fin_* của 5 tab tài chính Mobility cũ KHÔNG bị xoá (vẫn dùng cho
-- Tổng quan và Travel & SaaS).
-- =====================================================================

create table if not exists mob_state (
  id          text primary key default 'main',
  data        jsonb not null,
  version     integer not null default 1,
  updated_at  timestamptz not null default now(),
  updated_by  text
);

create table if not exists mob_db (
  path        text primary key,
  col         text generated always as (regexp_replace(path, '/[^/]*$', '')) stored,
  data        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  updated_by  text
);
create index if not exists mob_db_col_idx on mob_db (col);

-- Chỉ API phía server (service role) đọc/ghi; không mở cho trình duyệt
alter table mob_state enable row level security;
alter table mob_db    enable row level security;

-- Gộp JSON nhiều tầng: khoá có giá trị null nghĩa là xoá khoá đó
create or replace function mob_jsonb_merge(a jsonb, b jsonb) returns jsonb
language plpgsql immutable as $$
declare r jsonb := coalesce(a, '{}'::jsonb); k text; v jsonb;
begin
  if b is null or jsonb_typeof(b) <> 'object' then return b; end if;
  if jsonb_typeof(r) <> 'object' then r := '{}'::jsonb; end if;
  for k, v in select * from jsonb_each(b) loop
    if jsonb_typeof(v) = 'null' then
      r := r - k;
    elsif jsonb_typeof(v) = 'object' and jsonb_typeof(r -> k) = 'object' then
      r := jsonb_set(r, array[k], mob_jsonb_merge(r -> k, v));
    elsif jsonb_typeof(v) = 'object' then
      r := jsonb_set(r, array[k], jsonb_strip_nulls(v));
    else
      r := jsonb_set(r, array[k], v);
    end if;
  end loop;
  return r;
end $$;

-- Cập nhật một tài liệu (gộp, không ghi đè) trong một câu lệnh để hai người lưu cùng lúc không mất dữ liệu của nhau
create or replace function mob_db_update(p_path text, p_patch jsonb, p_by text) returns jsonb
language plpgsql as $$
declare res jsonb;
begin
  insert into mob_db (path, data, updated_by, updated_at)
  values (p_path, jsonb_strip_nulls(p_patch), p_by, now())
  on conflict (path) do update
    set data = mob_jsonb_merge(mob_db.data, p_patch), updated_by = p_by, updated_at = now()
  returning data into res;
  return res;
end $$;

revoke all on function mob_db_update(text, jsonb, text) from public, anon, authenticated;
revoke all on function mob_jsonb_merge(jsonb, jsonb) from public, anon, authenticated;
