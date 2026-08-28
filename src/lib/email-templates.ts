import { periodInWords, periodWordsFull } from './period';

const TEAL = '#03A695';
const LOGO = 'https://files.uts.network/email_assets/xperise_alt_fulllogo%402x.png';

/** Mã tham chiếu cố định trong tiêu đề — mọi email của một kỳ đi chung một thread. */
export function refSubject(nhomKh: string, ky: string, suffix = 'Bảng kê đối soát'): string {
  return `[REF: ${nhomKh} - ${ky}] ${suffix}`;
}

function shell(title: string, bodyHtml: string, ctaUrl?: string, ctaLabel?: string): string {
  return `<!DOCTYPE html>
<html lang="vi"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:24px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">
  <tr><td style="padding:24px 32px 16px;text-align:center;border-bottom:1px solid #C8E6FF;">
    <img src="${LOGO}" alt="xperise" width="130" style="display:block;margin:0 auto;">
  </td></tr>
  <tr><td style="background:${TEAL};padding:20px 32px;text-align:center;">
    <p style="margin:0;color:#ffffff;font-size:19px;font-weight:700;line-height:1.4;">${title}</p>
  </td></tr>
  <tr><td style="padding:32px;font-size:14px;color:#505050;line-height:1.7;">
    ${bodyHtml}
    ${ctaUrl ? `<div style="text-align:center;margin:28px 0 8px;">
      <a href="${ctaUrl}" style="display:inline-block;background:${TEAL};color:#ffffff;text-decoration:none;
        padding:13px 32px;border-radius:6px;font-weight:700;font-size:14px;">${ctaLabel}</a></div>` : ''}
  </td></tr>
  <tr><td style="padding:0 32px 28px;font-size:12px;color:#8a8a8a;line-height:1.6;border-top:1px solid #eee;padding-top:16px;">
    Email này được gửi tự động từ hệ thống đối soát xperise. Vui lòng trả lời trực tiếp email này để phản hồi.
  </td></tr>
</table></td></tr></table></body></html>`;
}

// ---------------------------------------------------------------------
// Email gửi khách hàng
// ---------------------------------------------------------------------

export function tplBangKe(
  nhomKh: string, ky: string, fileLink: string,
  phamVi?: string | null, soTep = 1,
): string {
  return shell(
    `Bảng kê dịch vụ ${periodWordsFull(ky, phamVi)}`,
    `<p style="margin:0 0 16px;">Thân gửi <strong>${nhomKh}</strong>,</p>
     <p style="margin:0 0 16px;">xperise xin gửi lời cảm ơn chân thành đến Quý doanh nghiệp đã lựa chọn
     sử dụng dịch vụ của chúng tôi. Dưới đây là bảng kê dịch vụ mà Quý doanh nghiệp đã sử dụng trong kỳ
     <strong>${periodWordsFull(ky, phamVi)}</strong>.</p>
     <p style="margin:0;">${soTep > 1
       ? `Kỳ này gồm <strong>${soTep} tệp</strong>, tất cả được đính kèm trong email này.`
       : 'Nhấn vào nút bên dưới để xem chi tiết bảng kê dịch vụ.'}</p>
     <div style="background:#F3FBFA;border-left:3px solid ${TEAL};padding:14px 16px;margin-top:24px;border-radius:4px;">
       <p style="margin:0 0 8px;font-weight:700;color:#0d4f48;">Lưu ý quan trọng</p>
       <p style="margin:0 0 6px;">• Quý khách vui lòng xác nhận bảng kê bằng cách trả lời trực tiếp email này.</p>
       <p style="margin:0 0 6px;">• Vui lòng thanh toán theo thời gian đã thỏa thuận trong hợp đồng.</p>
       <p style="margin:0;">• Chúng tôi có chiết khấu cho việc thanh toán sớm căn cứ theo thỏa thuận trong hợp đồng.</p>
     </div>`,
    fileLink, 'Xem bảng kê',
  );
}

export function tplBangKeSuaDoi(nhomKh: string, ky: string, version: number, fileLink: string): string {
  return shell(
    `Bảng kê ${periodInWords(ky)} — bản cập nhật ${version}`,
    `<p style="margin:0 0 16px;">Kính gửi <strong>${nhomKh}</strong>,</p>
     <p style="margin:0 0 16px;">xperise kính gửi bảng kê kỳ <strong>${ky}</strong> đã được cập nhật
     theo trao đổi và yêu cầu điều chỉnh của Quý khách.</p>
     <p style="margin:0;">Kính đề nghị Quý khách hàng xem xét và phản hồi xác nhận để hai Bên tiến hành
     các bước tiếp theo theo thỏa thuận trong Hợp đồng.</p>
     <p style="margin:20px 0 0;">Trân trọng,<br>Team xperise.</p>`,
    fileLink, 'Xem bảng kê cập nhật',
  );
}

export function tplHoSoThanhToan(nhomKh: string, ky: string, fileLink: string): string {
  return shell(
    `Hồ sơ thanh toán ${periodInWords(ky)}`,
    `<p style="margin:0 0 16px;">Kính gửi <strong>${nhomKh}</strong>,</p>
     <p style="margin:0 0 16px;">xperise kính gửi Quý khách hàng hồ sơ thanh toán kỳ <strong>${ky}</strong>.</p>
     <p style="margin:0;">Kính đề nghị Quý khách hàng thực hiện thanh toán theo thời gian đã thỏa thuận
     trong hợp đồng.</p>
     <p style="margin:20px 0 0;">Trân trọng,<br>Team xperise.</p>`,
    fileLink, 'Xem hồ sơ thanh toán',
  );
}

export function tplNhacKhach(ky: string, level: number, hanChapNhan: string): string {
  const capDo = level >= 3 ? ' (đã chuyển cấp quản lý)' : '';
  return shell(
    `Nhắc xác nhận bảng kê kỳ ${ky}${capDo}`,
    `<p style="margin:0 0 16px;">Kính gửi Quý khách hàng,</p>
     <p style="margin:0 0 16px;">Kính đề nghị Quý khách hàng kiểm tra và phản hồi xác nhận bảng kê kỳ
     <strong>${ky}</strong>. Hạn xác nhận theo thỏa thuận là <strong>${hanChapNhan}</strong>.</p>
     <p style="margin:0;">Vui lòng xác nhận bằng cách trả lời trực tiếp email này. Chân thành cảm ơn
     sự phối hợp của Quý khách hàng.</p>
     <p style="margin:20px 0 0;">Trân trọng,<br>Team xperise.</p>`,
  );
}

export function tplMacDinhChot(ky: string): string {
  return shell(
    `Thông báo chốt bảng kê kỳ ${ky}`,
    `<p style="margin:0 0 16px;">Kính gửi Quý khách hàng,</p>
     <p style="margin:0 0 16px;">Hiện tại team xperise vẫn chưa nhận được phản hồi xác nhận bảng kê kỳ
     <strong>${ky}</strong> từ Quý khách hàng.</p>
     <p style="margin:0 0 16px;">Theo quy định trong Hợp đồng, xperise xin thông báo bảng kê kỳ
     <strong>${ky}</strong> đã được mặc định xác nhận theo thời gian quy định. Team xperise sẽ tiến hành
     các bước tiếp theo theo quy định.</p>
     <p style="margin:20px 0 0;">Trân trọng,<br>Team xperise.</p>`,
  );
}

// ---------------------------------------------------------------------
// Email nội bộ — thread riêng, không trộn với thread khách
// ---------------------------------------------------------------------

function internalShell(tag: string, tagColor: string, title: string, lines: string[], ctaUrl?: string): string {
  return `<!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:24px;background:#f5f5f5;font-family:Arial,Helvetica,sans-serif;">
<table width="600" cellpadding="0" cellspacing="0" align="center" style="background:#fff;border-radius:8px;">
  <tr><td style="padding:20px 28px 0;">
    <span style="display:inline-block;background:${tagColor};color:#fff;font-size:11px;font-weight:700;
      letter-spacing:0.08em;padding:4px 10px;border-radius:3px;">${tag}</span>
    <h2 style="margin:14px 0 18px;font-size:18px;color:#10221F;line-height:1.4;">${title}</h2>
  </td></tr>
  <tr><td style="padding:0 28px 24px;font-size:14px;color:#505050;line-height:1.7;">
    ${lines.map((l) => `<p style="margin:0 0 10px;">${l}</p>`).join('')}
    ${ctaUrl ? `<div style="margin-top:22px;">
      <a href="${ctaUrl}" style="display:inline-block;background:${TEAL};color:#fff;text-decoration:none;
        padding:11px 24px;border-radius:6px;font-weight:700;font-size:14px;">Mở trên hệ thống</a></div>` : ''}
  </td></tr>
</table></body></html>`;
}

export function tplThieuEmailL1(nhomKh: string, ky: string, appUrl: string) {
  return {
    subject: `[CẢNH BÁO] Thiếu email đầu mối — ${nhomKh} ${ky}`,
    html: internalShell('CẢNH BÁO', '#C77914',
      `Khách ${nhomKh} chưa có email đầu mối, chưa gửi được bảng kê kỳ ${ky}`,
      ['Vui lòng cập nhật <strong>Email khách L1</strong> trong Master Data. Hệ thống sẽ thử lại vào sáng hôm sau.'],
      `${appUrl}/master-data`),
  };
}

export function tplThieuFile(nhomKh: string, ky: string, appUrl: string) {
  return {
    subject: `[URGENT] Trễ hạn nộp bảng kê ${nhomKh} kỳ ${ky}`,
    html: internalShell('URGENT', '#C0392B',
      `Chưa có bảng kê ${nhomKh} kỳ ${ky} trên hệ thống`,
      [
        `Hôm nay là hạn gửi bảng kê cho khách <strong>${nhomKh}</strong> nhưng chưa ai tải tệp lên.`,
        'Mở trang Tệp bảng kê, chọn nhóm và kỳ rồi tải tệp lên. Hệ thống gửi cho khách ngay sau đó.',
      ],
      `${appUrl}/files`),
  };
}

export function tplKhachYeuCauSua(nhomKh: string, ky: string, tomTat: string, phamVi: string, appUrl: string) {
  return {
    subject: `[CẦN PHÊ DUYỆT] ${nhomKh} ${ky} — khách đã phản hồi`,
    html: internalShell('CẦN PHÊ DUYỆT', TEAL,
      `Khách ${nhomKh} vừa phản hồi bảng kê kỳ ${ky}`,
      [
        `<strong>Tóm tắt phản hồi:</strong> ${tomTat}`,
        `<strong>Phạm vi:</strong> ${phamVi || 'không nêu rõ'}`,
        'Vui lòng mở hệ thống để xem nguyên văn email và chọn Đồng ý / Cần sửa / Từ chối.',
      ],
      `${appUrl}/approvals`),
  };
}

export function tplNhacNoiBoUpload(nhomKh: string, ky: string, what: string, appUrl: string) {
  return {
    subject: `[NHẮC NỘI BỘ] ${nhomKh} ${ky} — cần upload ${what}`,
    html: internalShell('NHẮC NỘI BỘ', '#C77914',
      `Quá hạn nội bộ 1 ngày: ${nhomKh} kỳ ${ky}`,
      [
        `Hệ thống ghi nhận cần <strong>${what}</strong> cho khách ${nhomKh} kỳ ${ky} từ hôm qua,
         nhưng chưa ai tải tệp lên hệ thống.`,
        'Kính nhờ team Kế toán xử lý và tải tệp lên để hệ thống gửi cho khách.',
      ],
      `${appUrl}/files`),
  };
}

export function tplEscalateNoiBo(nhomKh: string, ky: string, what: string, appUrl: string) {
  return {
    subject: `[ESCALATE] Trễ 2 ngày — ${nhomKh} ${ky} (${what})`,
    html: internalShell('ESCALATE', '#C0392B',
      `Quá hạn nội bộ 2 ngày: ${nhomKh} kỳ ${ky}`,
      [
        `Việc <strong>${what}</strong> cho khách ${nhomKh} kỳ ${ky} đã trễ 2 ngày so với hạn nội bộ.`,
        'Kính đề nghị cấp quản lý xem xét và chỉ đạo xử lý ngay để không làm chậm tiến độ đối soát và dòng tiền.',
      ],
      `${appUrl}/tracking`),
  };
}

export function tplCanQuyetDinh(nhomKh: string, ky: string, loops: number, level: number, appUrl: string) {
  return {
    subject: `[QUYẾT ĐỊNH] ${nhomKh} ${ky} — hết vòng nhắc khách`,
    html: internalShell('CẦN QUYẾT ĐỊNH', '#6B4FBB',
      `Khách ${nhomKh} không phản hồi sau toàn bộ vòng nhắc`,
      [
        `Kỳ đối soát: <strong>${ky}</strong>`,
        `Số vòng đã nhắc: <strong>${loops}</strong> — Cấp escalate cao nhất: <strong>L${level}</strong>`,
        'Theo quy định nhóm khách này, hệ thống không tự chốt. Vui lòng mở hệ thống để chọn Đồng ý hoặc Từ chối.',
      ],
      `${appUrl}/approvals`),
  };
}

export function tplThreadMat(nhomKh: string, ky: string, threadId: string, appUrl: string) {
  return {
    subject: `[CẢNH BÁO] Mất thread Gmail — ${nhomKh} ${ky}`,
    html: internalShell('CẢNH BÁO', '#C77914',
      `Không tìm thấy thread email của ${nhomKh} kỳ ${ky}`,
      [
        `Thread_ID <strong>${threadId}</strong> không còn tồn tại trong hộp thư.`,
        'Hệ thống đã chuyển dòng này sang "Cần xử lý tay". Vui lòng tìm lại thread trên Gmail và cập nhật lại Thread_ID, hoặc xử lý ngoài hệ thống.',
      ],
      `${appUrl}/tracking`),
  };
}

export function tplNhacChuanBiHstt(
  nhomKh: string, ky: string, hoSo: string, slaNgay: number | null, appUrl: string,
) {
  const muc = hoSo.split(/[,;]/).map((x) => x.trim()).filter(Boolean);
  return {
    subject: `[CHUẨN BỊ HSTT] ${nhomKh} ${ky} — đã chốt bảng kê`,
    html: internalShell('CHUẨN BỊ HỒ SƠ', TEAL,
      `${nhomKh} đã chốt bảng kê ${ky}, cần chuẩn bị hồ sơ thanh toán`,
      [
        'Theo Master Data, khách này yêu cầu các giấy tờ sau:',
        `<ul style="margin:0 0 6px;padding-left:20px;">${
          muc.map((m) => `<li style="margin-bottom:4px;"><strong>${m}</strong></li>`).join('')
        }</ul>`,
        slaNgay
          ? `Thời hạn theo thỏa thuận là <strong>${slaNgay} ngày</strong> kể từ hôm nay.`
          : 'Vui lòng chuẩn bị và tải lên sớm nhất có thể.',
        'Mở mục <strong>Chờ hồ sơ thanh toán</strong> trên hệ thống, chọn đúng nhóm và kỳ, '
          + 'chọn loại tệp <strong>Hồ sơ thanh toán</strong> rồi tải lên. Hệ thống gửi cho khách ngay sau đó.',
      ],
      `${appUrl}/hstt`),
  };
}
