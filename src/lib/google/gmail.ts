import { gmailApi } from './auth';

export type Attachment = { filename: string; mimeType: string; data: Buffer };

export type SendInput = {
  to: string;
  cc?: string;
  subject: string;
  html: string;
  attachments?: Attachment[];
  /** Trả lời vào thread có sẵn — bắt buộc khi tiếp nối thread bảng kê gốc. */
  threadId?: string;
};

export type SentMail = { id: string; threadId: string };

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Mã hóa tiêu đề để dấu tiếng Việt không bị vỡ trên client email. */
function encodeHeader(value: string): string {
  // eslint-disable-next-line no-control-regex
  return /^[\x00-\x7F]*$/.test(value)
    ? value
    : `=?UTF-8?B?${Buffer.from(value).toString('base64')}?=`;
}

function buildMime(input: SendInput, replyHeaders: string[]): string {
  const boundary = `xp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
  const headers = [
    `To: ${input.to}`,
    input.cc ? `Cc: ${input.cc}` : null,
    `Subject: ${encodeHeader(input.subject)}`,
    'MIME-Version: 1.0',
    ...replyHeaders,
  ].filter(Boolean) as string[];

  if (!input.attachments?.length) {
    return [
      ...headers,
      'Content-Type: text/html; charset="UTF-8"',
      'Content-Transfer-Encoding: base64',
      '',
      Buffer.from(input.html).toString('base64'),
    ].join('\r\n');
  }

  const parts = [
    ...headers,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(input.html).toString('base64'),
  ];

  for (const att of input.attachments) {
    parts.push(
      `--${boundary}`,
      `Content-Type: ${att.mimeType}; name="${att.filename}"`,
      'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; filename="${att.filename}"`,
      '',
      att.data.toString('base64'),
    );
  }
  parts.push(`--${boundary}--`, '');
  return parts.join('\r\n');
}

/**
 * Lấy Message-ID chuẩn RFC của tin nhắn cuối trong thread.
 * Gmail chỉ nối đúng thread khi có In-Reply-To và References trỏ tới giá trị này —
 * id nội bộ của Gmail không dùng được cho mục đích đó.
 */
async function lastRfcMessageId(threadId: string): Promise<string | null> {
  try {
    const gmail = await gmailApi();
    const { data } = await gmail.users.threads.get({
      userId: 'me', id: threadId, format: 'metadata', metadataHeaders: ['Message-ID'],
    });
    const messages = data.messages ?? [];
    const last = messages[messages.length - 1];
    return last?.payload?.headers?.find(
      (h) => h.name?.toLowerCase() === 'message-id',
    )?.value ?? null;
  } catch {
    return null;
  }
}

export async function sendMail(input: SendInput): Promise<SentMail> {
  const gmail = await gmailApi();

  const replyHeaders: string[] = [];
  if (input.threadId) {
    const rfcId = await lastRfcMessageId(input.threadId);
    if (rfcId) replyHeaders.push(`In-Reply-To: ${rfcId}`, `References: ${rfcId}`);
  }

  const { data } = await gmail.users.messages.send({
    userId: 'me',
    requestBody: {
      raw: b64url(buildMime(input, replyHeaders)),
      ...(input.threadId ? { threadId: input.threadId } : {}),
    },
  });

  return { id: data.id!, threadId: data.threadId! };
}

export type ThreadMessage = {
  id: string;
  from: string;
  subject: string;
  date: string;
  snippet: string;
  body: string;
  isFromUs: boolean;
};

function decodePart(data?: string | null): string {
  if (!data) return '';
  return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}

function extractBody(payload: any): string {
  if (!payload) return '';
  if (payload.mimeType === 'text/plain') return decodePart(payload.body?.data);
  if (payload.parts?.length) {
    const plain = payload.parts.find((p: any) => p.mimeType === 'text/plain');
    if (plain) return decodePart(plain.body?.data);
    for (const p of payload.parts) {
      const nested = extractBody(p);
      if (nested) return nested;
    }
  }
  if (payload.mimeType === 'text/html') {
    return decodePart(payload.body?.data).replace(/<[^>]+>/g, ' ');
  }
  return '';
}

/** Đọc toàn bộ tin trong một thread, đánh dấu tin nào do hệ thống gửi đi. */
export async function readThread(threadId: string, ourEmail: string): Promise<ThreadMessage[]> {
  const gmail = await gmailApi();
  const { data } = await gmail.users.threads.get({ userId: 'me', id: threadId, format: 'full' });

  return (data.messages ?? []).map((m) => {
    const headers = m.payload?.headers ?? [];
    const h = (name: string) =>
      headers.find((x) => x.name?.toLowerCase() === name)?.value ?? '';
    const from = h('from');
    return {
      id: m.id!,
      from,
      subject: h('subject'),
      date: h('date'),
      snippet: m.snippet ?? '',
      body: extractBody(m.payload).slice(0, 8000),
      isFromUs: from.toLowerCase().includes(ourEmail.toLowerCase()),
    };
  });
}

/** Thread còn tồn tại trên Gmail không — SOP yêu cầu cảnh báo khi thread biến mất. */
export async function threadExists(threadId: string): Promise<boolean> {
  try {
    const gmail = await gmailApi();
    await gmail.users.threads.get({ userId: 'me', id: threadId, format: 'minimal' });
    return true;
  } catch {
    return false;
  }
}

/** Địa chỉ của chính hộp thư đang kết nối. */
export async function ourAddress(): Promise<string> {
  const gmail = await gmailApi();
  const { data } = await gmail.users.getProfile({ userId: 'me' });
  return data.emailAddress ?? '';
}
