# Đối soát bảng kê — xperise

Hệ thống thay thế bốn workflow n8n bằng một website: quản lý Master Data, theo dõi
trạng thái từng kỳ, để kế toán duyệt phản hồi khách, và tự chạy các tiến trình nền.

**Stack:** Next.js 14 · Supabase (Postgres + Auth + RLS + Storage) · Gmail API · OpenAI · Vercel

Tệp bảng kê tải lên và lưu ngay trong hệ thống. Không dùng Google Drive.

---

## Đẩy lại toàn bộ mã nguồn lên GitHub

Bản này đã kiểm chứng: `tsc --noEmit` không lỗi, `next build` dựng đủ 15 route.

**Thay sạch, đừng trộn với bản cũ trên repo.** Repo hiện có một số tệp lạc ra thư
mục gốc và vài tệp đã bị thay thế nhưng chưa xoá. Trộn vào sẽ tiếp tục gãy.

### Trên máy cá nhân

```bash
git clone https://github.com/xperise/Reconciliation.git
cd Reconciliation

# Xoá sạch mã nguồn cũ, giữ lại .git
find . -maxdepth 1 ! -name '.git' ! -name '.' -exec rm -rf {} +

# Giải nén gói này vào đây, rồi:
git add -A
git commit -m "Dong bo lai toan bo ma nguon"
git push
```

### Trên trình duyệt bằng github.dev

1. Mở repo, nhấn phím `.` để vào VS Code trong trình duyệt
2. Xoá hết thư mục và tệp ở gốc, **trừ** `.git`
3. Kéo toàn bộ nội dung gói này thả vào cây thư mục
4. Sang tab Source Control, ghi nội dung commit, bấm Commit & Push

### Sau khi push

Vercel → **Redeploy** và **bỏ tick "Use existing Build Cache"**. Bộ đệm cũ còn giữ
dấu vết các tệp đã xoá; giữ lại sẽ dựng ra kết quả sai dù mã nguồn đã đúng.

---

## Cài đặt lần đầu

### Bước 1 — Cơ sở dữ liệu Supabase

Vào **SQL Editor**, chạy lần lượt các tệp trong thư mục `supabase/`, đúng thứ tự số:

| Thứ tự | Tệp | Tạo ra |
|---|---|---|
| 1 | `01_schema.sql` | Bảng, kiểu dữ liệu, trigger ghi lịch sử |
| 2 | `02_rls.sql` | Phân quyền theo vai trò |
| 3 | `03_seed_and_views.sql` | Bốn workflow mặc định và các view báo cáo |
| 4 | `04_storage.sql` | Kho tệp `bang-ke` và phân quyền tải lên |
| 5 | `05_seed_master_data.sql` | 40 nhóm đối soát và 113 pháp nhân |
| 6 | `06_bo_sung.sql` | Thông báo, nhật ký gửi, cột ngày duyệt |
| 7 | `07_lich_gui_va_lo_tep.sql` | Lịch nhiều đợt, kỳ theo tháng dữ liệu, lô tệp |

Phải thấy `Success` mới chạy tệp tiếp theo.

Sau đó vào **Authentication → Providers → Email**, tắt **Enable email signups**.
Tài khoản chỉ do quản trị viên cấp.

### Bước 2 — Biến môi trường trên Vercel

Chép từ `.env.example`. Tám biến, trong đó `OPENAI_API_KEY` và `CRON_SECRET` là tuỳ chọn.

`GOOGLE_REDIRECT_URI` phải trùng **tuyệt đối** với Authorized redirect URI khai
trong Google Cloud, kể cả `https://` và không có khoảng trắng thừa ở đầu.

### Bước 3 — Google Cloud

**APIs & Services → Library**: bật **Gmail API**. Không cần Drive API.

**OAuth consent screen → Data Access**: thêm ba scope
`gmail.send`, `gmail.readonly`, `gmail.modify`.

**Credentials → OAuth client ID** dạng Web application, thêm redirect URI:
`https://TEN-MIEN.vercel.app/api/google/callback`

### Bước 4 — Tài khoản quản trị đầu tiên

Supabase → **Authentication → Users → Add user**, bật **Auto Confirm User**. Rồi:

```sql
update profiles set role = 'admin' where email = 'email-cua-ban@congty.com';
```

### Bước 5 — Nối hộp thư

Đăng nhập website → **Quản lý → Cài đặt** → **Kết nối Google**.

Nếu báo thiếu mã làm mới: vào myaccount.google.com/permissions, gỡ quyền của ứng
dụng rồi kết nối lại. Google chỉ cấp mã làm mới ở lần cho phép đầu tiên.

**Hộp thư kết nối không được trùng với email dùng để đóng vai khách khi test.**
Hệ thống so địa chỉ người gửi với hộp thư của chính nó để phân biệt thư đi và thư
đến; trùng nhau thì mọi phản hồi test đều bị coi là thư do hệ thống gửi.

### Bước 6 — Nhịp đồng hồ

`vercel.json` để rỗng vì gói Hobby không cho khai cron mỗi phút. Dùng dịch vụ ngoài:

[cron-job.org](https://cron-job.org) → **Create cronjob**

- URL: `https://TEN-MIEN.vercel.app/api/cron/tick`
- Schedule: Custom, điền `* * * * *`
- Nếu có đặt `CRON_SECRET`: tab **ADVANCED → Headers**, thêm
  `Authorization` = `Bearer <giá trị CRON_SECRET>`

Bật **Save responses in job history** để đọc được phản hồi khi cần chẩn đoán.

Mở thẳng `https://TEN-MIEN.vercel.app/api/cron/tick` trên trình duyệt cũng được.
Endpoint trả về lý do bỏ qua từng workflow:

```json
{
  "gioVN": "08:15", "soWorkflow": 4, "soDangBat": 2,
  "ran": { "wf2": "Không có phản hồi mới." },
  "boQua": { "wf1": "hôm nay đã chạy rồi", "wf4": "chưa tới giờ hẹn 08:30, hiện 08:15" }
}
```

### Bước 7 — Bật workflow

**Quản lý → Workflow**. Bốn workflow tắt sẵn. Dùng **Chạy thử ngay** trước, đọc
kết quả, rồi mới bật lịch.

| Workflow | Việc làm | Lịch mặc định |
|---|---|---|
| WF1 | Gửi bảng kê cho lịch tới hạn hôm nay | 08:00 hằng ngày |
| WF2 | Nhận và phân loại phản hồi khách | mỗi 1 phút |
| WF3 | Gửi lại lô tệp chưa gửi được | mỗi 5 phút |
| WF4 | Nhắc khách theo cấp escalate, nhắc nội bộ khi chậm | 08:30 hằng ngày |

Trang Workflow tự hiện cảnh báo đỏ khi có workflow đang bật mà quá 10 phút không
lượt nào chạy — dấu hiệu cron chưa gọi tới được.

---

## Cấu trúc chức năng

Bốn nhóm tab trên thanh điều hướng:

**Tổng quan** — Dashboard ba tầng chỉ số: chiến lược, vận hành, cảnh báo. Mỗi ô số
bấm được, dẫn sang danh sách đã lọc sẵn. Lọc theo kỳ, khách hàng, trạng thái.

**Bảng kê** — Tệp bảng kê · Chờ duyệt · Chờ hồ sơ thanh toán · Theo dõi kỳ · Nhật ký

**Quản lý** — Master Data · Workflow · Người dùng · Cài đặt

**Hỗ trợ** — Hướng dẫn sử dụng dạng SOP tương tác, chia theo vai trò

---

## Lịch gửi và kỳ đối soát

Kỳ đối soát luôn mang tên tháng của **dữ liệu** bên trong nó, không phải tháng đem
đi gửi. Khách gửi ngày 28/8 cho dữ liệu tháng 8 ra `T08.2026`; khách gửi ngày 5/9
cho dữ liệu tháng 8 cũng ra `T08.2026`.

Mỗi nhóm khách có một hoặc nhiều **đợt** trong tháng, khai ở cuối trang Master Data:

| Trường | Ý nghĩa |
|---|---|
| Đợt số | 1, 2, 3… Khách gửi một lần mỗi tháng thì chỉ cần đợt 1 |
| Ngày gửi | Ngày trong tháng. Khai 31 thì tháng ngắn hơn gửi vào ngày cuối |
| Kỳ lấy dữ liệu | Tháng trước, hoặc tháng đang gửi |
| Nhãn phạm vi | Tự do, ví dụ "Nửa đầu tháng", "01–15" |
| SLA riêng | Để trống thì dùng SLA khai ở cấp nhóm |

---

## Tệp bảng kê

Đặt tên thế nào cũng được. Khi tải lên bạn chọn nhóm, kỳ và loại từ danh sách nên
hệ thống không phải đoán gì từ tên tệp. Kéo nhiều tệp của nhiều khách cùng lúc,
hệ thống đoán sẵn nhóm bằng cách dò mã hệ thống trong tên tệp.

Tệp cùng khách, cùng kỳ, cùng đợt, cùng loại tải lên trong một lượt sẽ **gộp thành
một lô**, mang chung số bản và đính kèm chung vào một email.

Ba loại: **Bảng kê** (bản đầu) · **Bảng kê chỉnh sửa** (sau khi khách có ý kiến) ·
**Hồ sơ thanh toán**.

Nhận `.xlsx .xls .docx .doc .pdf .zip`, tối đa 50 MB mỗi tệp.

Hệ thống hỏi lại trước khi gửi trong ba tình huống: loại tệp này đã gửi rồi, kỳ đã
chốt mà tải bản chỉnh sửa, và hồ sơ thanh toán đã gửi mà gửi tiếp. Cả ba đều bắt
tick xác nhận và nhập lý do, ghi vào Nhật ký.

---

## Chạy trên máy cá nhân

```bash
npm install
cp .env.example .env.local   # điền giá trị thật
npm run dev
```

Nhớ thêm `http://localhost:3000/api/google/callback` vào danh sách redirect URI
trong Google Cloud.

Cron không chạy ở máy cá nhân. Gọi tay:

```bash
curl http://localhost:3000/api/cron/tick
```

---

## Cấu trúc thư mục

```
supabase/           Bảy tệp SQL, chạy theo thứ tự số
src/lib/            Supabase, Gmail, kho tệp, OpenAI, chỉ số, mẫu email
src/workflows/      Bốn workflow và bộ điều phối lịch chạy
src/app/(app)/      Các trang sau khi đăng nhập
src/app/api/        Cron, chạy workflow thủ công, OAuth Google
src/app/actions.ts  Server action cho mọi thao tác ghi dữ liệu
```
