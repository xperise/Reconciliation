# Tuân thủ bảng kê — lõi xử lý (bước 1–2)

Chỉ chạy phía máy chủ (dùng exceljs và Buffer). Chưa nối giao diện, chưa có bảng Supabase.

- `types.ts`   kiểu dữ liệu dùng chung
- `vcb.ts`     tham số VCB theo HĐ GỐC 216.2.0.2026/VCB-UTS (chưa áp sửa đổi)
- `raw.ts`     đọc file raw khách sạn / vé máy bay; ô gộp: chữ lấy theo ô đầu, tiền chỉ tính một lần
- `tinh.ts`    tự sửa chiết khấu, phí, tổng thành tiền theo quy tắc + ghi nhật ký từng ô bị sửa; khoảng kỳ; tổng hợp
- `kiem.ts`    chạy các quy tắc tự động, trả cảnh báo kèm số dòng raw
- `bang-ke.ts` dựng bảng kê theo mẫu VCB (3 sheet, dòng tổng là công thức)
- `bao-cao.ts` báo cáo kiểm tra cho kế toán và CEO

Luồng gọi: docRaw(ks) + docRaw(vmb) → tuSua(dong, ts) → kiemTra(...) → taoBangKe(...) + taoBaoCao(...)
Đã chạy thử trên raw T10/2026 của VCB: bảng kê tổng 2.657.626.774,94đ, khớp tổng raw.
