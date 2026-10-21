-- =====================================================================
-- 25_huong_dan_tep_dinh_kem.sql — Tab Hướng dẫn: tệp đính kèm (PDF có sẵn), nhóm mục, "việc hay làm", nhập gói
-- Chạy SAU 23_huong_dan.sql (và 24 nếu đã chạy). Supabase → SQL Editor → Run. Chạy lại nhiều lần không mất dữ liệu.
--
--   guides.extras      : thông tin phụ của bộ hướng dẫn — dành cho ai, cổng dùng, việc hay làm, chỉ số nhanh
--   guide_files        : tệp đính kèm của từng hướng dẫn (PDF, Word, PowerPoint, ảnh…) để team tải về gửi đi
--   guide_images.src_key : mã ảnh gốc khi nhập gói, để nhập lại không tạo ảnh trùng
--   bucket guide-files : kho tệp riêng tư; web cấp link tải có chữ ký, hết hạn sau 5 phút
-- =====================================================================

alter table guides add column if not exists extras jsonb not null default '{}';

alter table guide_images add column if not exists src_key text;
create unique index if not exists guide_images_src_key_idx on guide_images (src_key) where src_key is not null;

create table if not exists guide_files (
  id           uuid primary key default gen_random_uuid(),
  guide_id     uuid not null references guides(id) on delete cascade,
  label        text not null,               -- tên hiển thị, ví dụ "Userguide khách hàng (bản gửi khách)"
  note         text,                        -- ghi chú: gửi cho ai, khi nào
  file_name    text not null,
  storage_path text not null unique,
  mime_type    text,
  size_bytes   bigint,
  sort         int not null default 100,
  uploaded_by  text,
  uploaded_at  timestamptz not null default now()
);
create index if not exists guide_files_guide_idx on guide_files (guide_id, sort);
alter table guide_files enable row level security;

insert into storage.buckets (id, name, public, file_size_limit)
values ('guide-files', 'guide-files', false, 52428800)   -- 50 MB mỗi tệp
on conflict (id) do update set file_size_limit = excluded.file_size_limit, public = false;
