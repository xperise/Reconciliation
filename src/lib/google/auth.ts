import { google } from 'googleapis';
import { supabaseAdmin } from '../supabase/admin';

export const GOOGLE_SCOPES = [
  'openid',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.modify',
];

const SETTINGS_KEY = 'google_oauth';

export function oauthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID!,
    process.env.GOOGLE_CLIENT_SECRET!,
    process.env.GOOGLE_REDIRECT_URI!,
  );
}

/** URL để admin bấm "Kết nối Google" một lần duy nhất. */
export function consentUrl(state: string) {
  return oauthClient().generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',       // buộc Google trả refresh_token kể cả lần cấp quyền thứ hai
    scope: GOOGLE_SCOPES,
    state,
  });
}

export async function saveRefreshToken(refreshToken: string, email: string) {
  const { error } = await supabaseAdmin()
    .from('app_settings')
    .upsert(
      {
        key: SETTINGS_KEY,
        value: { refresh_token: refreshToken, email, connected_at: new Date().toISOString() },
        updated_at: new Date().toISOString(),
      },
      { 
        onConflict: 'key' // Rất quan trọng: Báo cho Supabase biết phải đè dữ liệu dựa trên cột 'key'
      }
    );

  // Thêm đoạn này để bắt lỗi hiển thị ra Vercel Logs nếu Supabase từ chối lưu
  if (error) {
    console.error("LỖI SUPABASE KHI LƯU TOKEN:", error);
    throw new Error("Không thể lưu token vào Database: " + error.message);
  }
}

export async function googleConnection(): Promise<{ email: string; connected_at: string } | null> {
  const { data } = await supabaseAdmin()
    .from('app_settings').select('value').eq('key', SETTINGS_KEY).maybeSingle();
  if (!data?.value?.refresh_token) return null;
  return { email: data.value.email, connected_at: data.value.connected_at };
}

/**
 * Client đã nạp refresh token, sẵn sàng gọi Gmail/Drive.
 * Ném lỗi rõ ràng nếu chưa kết nối để workflow báo đúng nguyên nhân.
 */
export async function authorizedClient() {
  const { data } = await supabaseAdmin()
    .from('app_settings').select('value').eq('key', SETTINGS_KEY).maybeSingle();

  const refreshToken = data?.value?.refresh_token;
  if (!refreshToken) {
    throw new Error(
      'Chưa kết nối tài khoản Google. Vào Cài đặt và bấm "Kết nối Google" trước khi bật workflow.',
    );
  }

  const client = oauthClient();
  client.setCredentials({ refresh_token: refreshToken });
  return client;
}

export async function gmailApi() {
  return google.gmail({ version: 'v1', auth: await authorizedClient() });
}

