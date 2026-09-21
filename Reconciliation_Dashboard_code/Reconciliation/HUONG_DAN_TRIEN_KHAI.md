# Dashboard quản trị — hướng dẫn triển khai (khớp repo xperise/Reconciliation, commit b8b0c74)

## Bước 1 — Supabase
SQL Editor → dán `supabase/migrations/14_dashboard_tai_chinh.sql` → Run.
(Chạy sau 13_phan_quyen_tab.sql — đã có trong repo.)

## Bước 2 — Vercel
Không cần thêm biến môi trường: dùng lại NEXT_PUBLIC_SUPABASE_URL và SUPABASE_SERVICE_ROLE_KEY app đang dùng.

## Bước 3 — GitHub
Add file → Upload files → kéo 3 thư mục `src`, `public`, `supabase` trong zip này vào gốc repo → Commit.
GitHub sẽ GHI ĐÈ 7 file cũ và THÊM file mới. Không có file nào bị xóa.

### 7 file bị ghi đè (đã sửa)
- src/lib/access.ts — thêm quyền `dashboard`
- src/middleware.ts — chặn /dashboard và /api/dashboard nếu không có quyền
- src/components/AppTabs.tsx — thêm nút "Dashboard" cạnh Xperise | MLX
- src/app/(app)/shell.tsx — trang Dashboard dùng thanh tab riêng (giống MLX)
- src/app/(app)/users/page.tsx, user-form.tsx — thêm ô tick "Dashboard"
- src/app/actions.ts — lưu quyền xem_dashboard khi tạo / sửa người dùng

### File mới
- src/app/(app)/dashboard/page.tsx, dashboard.css
- src/app/api/dashboard/data|upload|snapshot/route.ts
- src/lib/dashboard/*.ts, src/components/dashboard/DataTab.tsx
- public/dashboard/templates/*.xlsx
- supabase/migrations/14_dashboard_tai_chinh.sql

## Bước 4 — Cấp quyền
Người dùng → tick "Dashboard" cho người cần xem. Admin luôn xem được.
- Upload dữ liệu & chốt hoa hồng: Quản trị, Kế toán.
- Cấp quản lý, PM: chỉ xem.
