import { NextResponse } from 'next/server';
// Sửa đường dẫn dưới đây theo đúng file bạn đã tạo trong project
import { client } from '@/lib/google'; 

export async function GET(req: Request) {
   // ...

  try {
    // 1. Lấy tham số `code` từ URL do Google trả về (nếu bạn chưa có)
    const url = new URL(req.url);
    const code = url.searchParams.get('code');

    if (!code) {
      return NextResponse.redirect(new URL('/settings?loi=thieu_code', req.url));
    }

    // 2. Logic hiện tại của bạn đưa vào đây
    const { tokens } = await client.getToken(code);

    if (!tokens.refresh_token) {
      return NextResponse.redirect(new URL('/settings?loi=thieu_refresh_token', req.url));
    }

    client.setCredentials(tokens);
    
    // ... (logic lưu database, lưu cấu hình hòm thư của bạn) ...
    // ví dụ: note: `Kết nối hộp thư ${email || '(không xác định được email)'}`,

    return NextResponse.redirect(new URL('/settings?ok=da_ket_noi', req.url));
    
  } catch (err) {
    console.error('[google callback]', err);
    return NextResponse.redirect(new URL('/settings?loi=doi_token_that_bai', req.url));
  }
}
