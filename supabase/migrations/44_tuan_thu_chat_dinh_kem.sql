-- =====================================================================
-- 44_tuan_thu_chat_dinh_kem.sql — Khung agent như Claude: đính kèm file vào tin nhắn
--   (PDF, Excel, CSV, ảnh, Word, văn bản). File tải thẳng lên Storage; agent đọc nội dung
--   và dùng được file đó cho thao tác (tạo lần chạy từ raw, tải lại raw, thêm hợp đồng từ PDF).
-- Chạy SAU 43_tuan_thu_them_hop_dong.sql.
-- =====================================================================

alter table tt_chat add column if not exists tep jsonb;   -- [{path, ten, loai}]

-- Bucket bang-ke nhận thêm ảnh, CSV, văn bản cho file đính kèm chat
update storage.buckets set allowed_mime_types = array[
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'application/pdf',
  'application/zip',
  'application/x-zip-compressed',
  'image/png', 'image/jpeg', 'image/webp', 'image/gif',
  'text/csv', 'text/plain', 'text/markdown'
] where id = 'bang-ke';
