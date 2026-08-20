# Đối soát bảng kê — xperise

Hệ thống thay thế bốn workflow n8n bằng một website: quản lý Master Data, theo dõi
trạng thái từng kỳ, để kế toán duyệt phản hồi khách, và tự chạy các tiến trình nền.

**Stack:** Next.js 14 · Supabase (Postgres + Auth + RLS + Storage) · Gmail API · OpenAI · Vercel

Tệp bảng kê tải lên và lưu ngay trong hệ thống. Không dùng Google Drive.

---

## Trước khi bắt đầu

Bạn cần bốn tài khoản, tất cả đều có gói miễn phí đủ dùng:

| Dịch vụ | Dùng để làm gì | Đăng ký tại |
|---|---|---|
| GitHub | Chứa mã nguồn | github.com |
| Supabase | Cơ sở dữ liệu và đăng nhập | supabase.com |
| Vercel | Chạy website và lịch tự động | vercel.com |
| Google Cloud | Cấp quyền gửi và đọc Gmail | console.cloud.google.com |

Ngoài ra cần một tài khoản OpenAI nếu muốn AI phân loại phản hồi. Bỏ qua cũng được —
hệ thống tự chuyển sang phân loại theo từ khóa và vẫn chạy đủ quy trình.

Toàn bộ quá trình mất khoảng 45 phút. Làm đúng thứ tự dưới đây.

---

## Bước 1 — Đưa mã nguồn lên GitHub

Tạo một repository trống trên GitHub (đặt Private), rồi trong thư mục dự án chạy:

```bash
git init
git add .
git commit -m "Khoi tao he thong doi soat bang ke"
git branch -M main
git remote add origin https://github.com/TEN-CUA-BAN/xperise-doisoat.git
git push -u origin main
```

Thư mục `node_modules` và tệp `.env` đã được `.gitignore` loại trừ sẵn, không lo lộ khóa.

---

## Bước 2 — Dựng cơ sở dữ liệu Supabase

1. Vào supabase.com, bấm **New project**. Chọn region **Southeast Asia (Singapore)** cho gần Việt Nam.
2. Đặt mật khẩu database và lưu lại ở nơi an toàn.
3. Đợi khoảng 2 phút cho project khởi tạo xong.
4. Mở **SQL Editor** ở thanh bên trái. Chạy lần lượt **đúng thứ tự** ba tệp trong thư mục `supabase/`:

   | Thứ tự | Tệp | Tạo ra |
   |---|---|---|
   | 1 | `01_schema.sql` | Bảng, kiểu dữ liệu, trigger ghi lịch sử |
   | 2 | `02_rls.sql` | Phân quyền theo vai trò |
   | 3 | `03_seed_and_views.sql` | Bốn workflow mặc định và các view báo cáo |
   | 4 | `04_storage.sql` | Kho tệp `bang-ke` và phân quyền tải lên |

   Dán nội dung từng tệp vào SQL Editor rồi bấm **Run**. Phải thấy `Success` mới chạy tệp tiếp theo.

5. Vào **Project Settings → API**, chép ba giá trị sau, lát nữa sẽ dùng:
   - `Project URL`
   - `anon public` key
   - `service_role` key — khóa này bỏ qua mọi phân quyền, chỉ dùng ở phía máy chủ

6. Vào **Authentication → Providers → Email**, tắt **Enable email signups**.
   Tài khoản chỉ do quản trị viên cấp, không cho tự đăng ký.

---

## Bước 3 — Cấp quyền Gmail

1. Vào console.cloud.google.com, tạo project mới.
2. **APIs & Services → Library**, bật **Gmail API**.
3. **APIs & Services → OAuth consent screen**:
   - Chọn **Internal** nếu công ty dùng Google Workspace, còn không thì chọn **External**.
   - Điền tên ứng dụng và email liên hệ.
   - Ở mục Scopes, thêm ba quyền: `gmail.send`, `gmail.readonly`, `gmail.modify`.
   - Nếu chọn External, thêm email hộp thư vận hành vào danh sách **Test users**.
4. **APIs & Services → Credentials → Create Credentials → OAuth client ID**:
   - Application type: **Web application**
   - Authorized redirect URIs: tạm điền `http://localhost:3000/api/google/callback`.
     Sau khi có tên miền Vercel ở bước 4, quay lại thêm URI thật.
5. Chép **Client ID** và **Client Secret**.

---

## Bước 4 — Triển khai lên Vercel

1. Vào vercel.com, bấm **Add New → Project**, chọn repository vừa đẩy lên GitHub.
2. Vercel tự nhận diện Next.js, không cần đổi build settings.
3. Mở **Environment Variables**, thêm từng biến theo tệp `.env.example`:

   | Biến | Giá trị |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Project URL từ bước 2 |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon public key |
   | `SUPABASE_SERVICE_ROLE_KEY` | service_role key |
   | `GOOGLE_CLIENT_ID` | từ bước 3 |
   | `GOOGLE_CLIENT_SECRET` | từ bước 3 |
   | `GOOGLE_REDIRECT_URI` | `https://TEN-MIEN.vercel.app/api/google/callback` |
   | `NEXT_PUBLIC_APP_URL` | `https://TEN-MIEN.vercel.app` |
   | `OPENAI_API_KEY` | tùy chọn |
   | `CRON_SECRET` | một chuỗi ngẫu nhiên bạn tự đặt |

4. Bấm **Deploy**. Xong sẽ có tên miền dạng `xperise-doisoat.vercel.app`.
5. **Quay lại Google Cloud**, thêm redirect URI thật:
   `https://TEN-MIEN.vercel.app/api/google/callback`
6. Về Vercel, sửa lại `GOOGLE_REDIRECT_URI` và `NEXT_PUBLIC_APP_URL` cho khớp tên miền
   thật, rồi **Redeploy**.

Lịch cron mỗi phút đã khai sẵn trong `vercel.json`, Vercel tự kích hoạt sau lần deploy đầu.

---

## Bước 5 — Tạo tài khoản quản trị đầu tiên

Vì đã tắt tự đăng ký, tài khoản đầu tiên phải tạo tay:

1. Supabase → **Authentication → Users → Add user**
2. Điền email và mật khẩu, bật **Auto Confirm User**
3. Sang **SQL Editor**, nâng tài khoản đó lên quyền quản trị:

```sql
update profiles set role = 'admin' where email = 'email-cua-ban@congty.com';
```

Giờ đăng nhập được vào website bằng tài khoản này.

---

## Bước 6 — Nối hộp thư

1. Đăng nhập website, vào **Cài đặt**.
2. Bấm **Kết nối Google**, chọn hộp thư vận hành và chấp nhận quyền.

Nếu gặp lỗi "Google không trả về mã làm mới": vào myaccount.google.com/permissions,
gỡ quyền của ứng dụng, rồi kết nối lại. Google chỉ cấp mã làm mới ở lần cho phép đầu tiên.

Kho tệp không cần cấu hình gì thêm — tệp `04_storage.sql` đã tạo sẵn.

---

## Bước 7 — Kiểm tra kho tệp

Vào **Tệp bảng kê**, thử tải một tệp bất kỳ lên với ô "Gửi cho khách ngay" **bỏ chọn**.
Nếu tệp hiện trong bảng với nhãn *Chờ gửi* thì kho đã chạy đúng. Bấm **Xóa** để dọn.

Nếu báo lỗi quyền, kiểm tra lại rằng `04_storage.sql` đã chạy thành công và tài khoản của
bạn có vai trò `admin` hoặc `ke_toan`.

---

## Bước 8 — Nhập Master Data

Vào **Master Data → Thêm nhóm**. Mỗi nhóm là một đơn vị nhận bảng kê.

Một điểm cần chú ý khi chuyển từ sheet cũ: sheet cũ có 40 dòng ROX với dữ liệu giống hệt
nhau, nhưng ở đây chỉ tạo **một nhóm ROX duy nhất**. Bốn mươi pháp nhân con là dữ liệu tra
cứu, không phải bốn mươi lần gửi email.

Cần khai tối thiểu: mã hệ thống, tên nhóm, ngày gửi, SLA chấp nhận, email L1, email kế toán.

---

## Bước 9 — Chạy thử rồi mới bật

Bốn workflow đều **tắt sẵn**. Vào trang **Workflow**, với từng cái bấm **Chạy thử ngay** và
đọc kết quả trước khi bật lịch tự động.

| Workflow | Việc nó làm | Lịch mặc định |
|---|---|---|
| WF1 | Gửi bảng kê cho nhóm đến hạn hôm nay | 08:00 hằng ngày |
| WF2 | Đọc phản hồi khách, phân loại, đẩy vào hàng chờ duyệt | mỗi 1 phút |
| WF3 | Gửi lại những tệp đã tải lên nhưng chưa gửi được | mỗi 5 phút |
| WF4 | Nhắc khách theo cấp escalate, nhắc nội bộ khi chậm | 08:30 hằng ngày |

WF3 giờ chỉ là lưới an toàn. Bình thường tệp được gửi ngay lúc tải lên; WF3 vớt những
lần gửi hỏng giữa chừng do mạng hoặc Gmail lỗi tạm.

Nên chạy thử với một nhóm khách dùng email nội bộ trước khi bật cho khách thật.

Đổi giờ chạy trên trang này là có hiệu lực ngay, không cần deploy lại. Nhịp cron mỗi phút
chỉ hỏi cơ sở dữ liệu xem đến giờ chạy gì chưa.

---

## Vận hành hằng ngày

**Kế toán** — tải bảng kê lên ở trang **Tệp bảng kê**, và mỗi ngày mở trang **Chờ duyệt**
để xử lý phản hồi khách. Không cần trả lời email khách trực tiếp, cũng không cần mở Drive.

**PM** — theo dõi trang **Theo dõi kỳ**, dùng nút **Can thiệp** khi cần dừng hệ thống hoặc sửa
Thread ID. Mọi can thiệp đều vào nhật ký kèm tên người thực hiện.

**Quản trị** — cấp tài khoản ở trang **Người dùng**, theo dõi lỗi ở trang **Workflow**.

### Về tên tệp

Đặt tên thế nào cũng được. Khi tải lên bạn chọn nhóm, kỳ và loại tệp từ danh sách, nên hệ
thống không phải đoán gì từ tên file. Phiên bản tự đánh số: bảng kê đầu tiên của một kỳ là
bản 1, lần tải kế tiếp cho cùng kỳ là bản 2, và email gửi khách sẽ ghi rõ đây là bản cập nhật.

Nhận các đuôi `.xlsx .xls .docx .doc .pdf .zip`, tối đa 50 MB mỗi tệp.

Tệp đã gửi cho khách thì không xóa được — muốn sửa thì tải bản mới lên, hệ thống giữ lại
bản cũ để truy vết khi có khiếu nại.

---

## Chạy trên máy cá nhân

```bash
npm install
cp .env.example .env.local   # điền giá trị thật
npm run dev
```

Mở http://localhost:3000. Nhớ thêm `http://localhost:3000/api/google/callback` vào
danh sách redirect URI trong Google Cloud.

Cron của Vercel không chạy ở máy cá nhân. Muốn thử thì gọi tay:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/tick
```

---

## Khác biệt so với bản n8n

Trong lúc chuyển đổi, năm điểm sau được sửa vì chúng gây lỗi thật trên dữ liệu thật:

1. **Bỏ hẳn khâu dò tên file.** Bản cũ quét tên file trên My Drive rồi tách chuỗi để suy ra
   nhóm và kỳ, sai một ký tự là hỏng, hai khách trùng tên file thì lẫn vào nhau. Giờ nhóm,
   kỳ và loại tệp là trường có cấu trúc do người tải lên chọn từ danh sách.

2. **Tách nhóm đối soát khỏi pháp nhân.** Bản cũ gom nhóm theo cột "Tên viết tắt trên
   System" nhưng lại tra cứu theo cột "Nhóm KH". Với BIG C và EB hai cột này khác nhau
   (`EB` và `CENTRAL RETAIL`) nên tra cứu trượt và tạo dòng trùng.

3. **Cơ sở dữ liệu chặn dòng trùng.** Mỗi nhóm mỗi kỳ chỉ một dòng — trên Sheets đây là
   quy ước dễ vỡ, ở đây là ràng buộc cứng.

4. **Chống gửi trùng bằng cột `sent_at`.** Bản cũ so link Drive, mà upload lại cùng nội dung
   thì sinh link mới nên khách bị gửi thêm lần nữa. Giờ mỗi tệp gửi đúng một lần.

5. **Khách nói thêm khi đang chờ bản sửa thì được xử lý.** Bản cũ chỉ ghi vào cột ghi chú
   rồi im lặng; bản này đẩy lại hàng chờ duyệt.

Hai việc SOP ghi "chưa cover" nay đã có: nhắc nội bộ khi chậm hồ sơ thanh toán, và ghi
nhật ký thời gian nằm ở mỗi trạng thái để tìm nút thắt cổ chai.

---

## Cấu trúc thư mục

```
supabase/           Bốn tệp SQL, chạy theo thứ tự số
src/lib/            Kết nối Supabase, Gmail, kho tệp, OpenAI, mẫu email
src/workflows/      Bốn workflow và bộ điều phối lịch chạy
src/app/(app)/      Các trang sau khi đăng nhập
src/app/api/        Cron, chạy workflow thủ công, OAuth Google
src/app/actions.ts  Server action cho mọi thao tác ghi dữ liệu
```

