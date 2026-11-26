import { NextResponse } from "next/server";
import { guard } from "@/lib/dashboard/server";
import { errMsg, fail } from "@/lib/dashboard/mobility";
import { goiMoHinh, TEN_MO_HINH } from "@/lib/tuan-thu/ai-provider";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** "Hỏi AI" trên dashboard Mobility.
 *  Server chỉ gọi mô hình (dùng chung lớp gọi AI và khoá API với agent Tuân thủ). Công cụ đọc số liệu chạy trong trình duyệt
 *  của người hỏi, trên đúng dữ liệu dashboard họ đang xem: trang gửi lại kết quả công cụ ở lượt sau. Bản này chỉ đọc, chưa ghi. */

type Tool = { name: string; description: string; input_schema: any };
const S = (description: string) => ({ type: "string", description });
const B = (description: string) => ({ type: "boolean", description });
const N = (description: string) => ({ type: "integer", description });
const obj = (properties: Record<string, any>, required: string[] = []) => ({ type: "object", properties, required });

const TOOLS: Tool[] = [
  { name: "tim_khach", description: "Tìm khách hàng theo tên (gõ tắt, không dấu đều được), số hợp đồng, nhóm client hoặc tên người liên hệ. Trả về tối đa 15 khách: mã, tên, PIC, bước hiện tại. Dùng trước khi trả lời về một khách cụ thể; nếu ra nhiều khách cùng tên (ví dụ KPMG có nhiều pháp nhân) thì hỏi lại người dùng là khách nào.",
    input_schema: obj({ q: S("chuỗi cần tìm"), gioi_han: N("số khách tối đa, mặc định 15") }, ["q"]) },
  { name: "xem_khach", description: "Xem hồ sơ một khách theo mã (số hợp đồng hoặc mã XPAY-…): PIC, các mốc (đồng ý ký, ký phụ lục, ký HĐ mới, khởi tạo XPAY) kèm ngày, số thẻ XPAY, GMV XPAY 30 ngày, hạng Top 300, các hoạt động gần nhất, next step, meeting sắp tới.",
    input_schema: obj({ ma: S("mã khách") }, ["ma"]) },
  { name: "loc_khach", description: "Lọc và đếm khách theo điều kiện; trả về tổng số và danh sách (mặc định 20 khách đầu theo thứ tự sắp xếp). Mọi điều kiện không bắt buộc.",
    input_schema: obj({
      pic: S("tên PIC; 'chua_co' = chưa phân công"), da_ky: B("đã ký phụ lục / HĐ mới"), dong_y_ky: B("đã đồng ý ký (verbal)"), khoi_tao: B("đã khởi tạo XPAY"),
      co_the: B("đang có thẻ XPAY"), active_30: B("có giao dịch XPAY trong 30 ngày"), top300: B("thuộc Top 300"), co_meeting: B("đã có meeting"),
      next_step_qua_han: B("next step đã quá hạn"), sap_xep: { type: "string", enum: ["gmv30", "so_the", "hang_top300", "ten", "hoat_dong_gan_nhat"] }, gioi_han: N("tối đa 50"),
    }) },
  { name: "tong_quan", description: "Số liệu tổng của dashboard: tổng khách, đã ký, đồng ý ký, đã khởi tạo XPAY, có thẻ, active 30 ngày, GMV XPAY 30 ngày, tổng thẻ; và các số đó theo từng PIC.", input_schema: obj({}) },
];

const SYSTEM = (today: string, email: string, ctx: string) => `Bạn là "Hỏi AI" trên dashboard Mobility (XPAY) của Xperise. Người hỏi là nhân sự kinh doanh / quản lý (${email}). Hôm nay là ${today}.
Nhiệm vụ: trả lời câu hỏi về khách hàng và tiến độ triển khai XPAY dựa trên số liệu dashboard, đọc qua công cụ.
Quy tắc:
- Trả lời tiếng Việt, ngắn gọn, đi thẳng vào ý. Dùng gạch đầu dòng khi liệt kê. Số tiền ghi theo kiểu Việt Nam (1.234.000 đ, hoặc 12,5 triệu).
- Chỉ nói số liệu lấy từ kết quả công cụ trong cuộc trò chuyện này. Không đoán, không bịa. Thiếu dữ liệu thì nói rõ là dashboard chưa có.
- Khi nhắc tới một khách, viết dạng [[mã|tên ngắn]] để người dùng bấm mở hồ sơ, ví dụ [[20000025|KPMG]].
- Tên khách gõ tắt hoặc không dấu: dùng tim_khach. Ra nhiều khách thì liệt kê và hỏi lại khách nào, đừng tự chọn.
- Bản này CHỈ ĐỌC. Nếu người dùng nhắn thông tin để cập nhật (ví dụ "KPMG đi Vinasun", "đã gặp anh A bên Navigos, hẹn ký tuần sau"): tìm đúng khách, nói lại bạn hiểu thông tin đó thế nào (trường nào, giá trị gì), rồi báo việc tự ghi vào hồ sơ sẽ có ở bản sau; hiện tại người dùng cập nhật trong hồ sơ khách.
- Không đưa số thẻ, pantoken, số điện thoại hay email người liên hệ vào câu trả lời.
Bối cảnh màn hình người dùng đang xem: ${ctx || "không rõ"}.`;

export async function POST(req: Request) {
  try {
    const g = await guard(false, "m");
    if ("error" in g) return fail(g.error, g.status);
    const body = (await req.json().catch(() => ({}))) as { messages?: any[]; ctx?: string; today?: string };
    const messages = Array.isArray(body.messages) ? body.messages.slice(-40) : [];
    if (!messages.length) return fail("Chưa có câu hỏi", 400);
    if (JSON.stringify(messages).length > 400_000) return fail("Cuộc trò chuyện quá dài, bấm Cuộc mới để hỏi tiếp", 413, "too_long");
    const today = /^\d{4}-\d{2}-\d{2}$/.test(body.today || "") ? body.today! : new Date().toISOString().slice(0, 10);
    const r = await goiMoHinh({ system: SYSTEM(today, g.user.email, String(body.ctx || "").slice(0, 400)), messages, tools: TOOLS, max_tokens: 1500 });
    return NextResponse.json({ content: r.content, stop_reason: r.stop_reason, model: TEN_MO_HINH() }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) { return fail(errMsg(e), 500); }
}
