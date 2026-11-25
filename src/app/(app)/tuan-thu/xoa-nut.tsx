'use client';

import { Nut } from './ui';

type KQ = { ok: true; id?: string; thongBao?: string } | { ok: false; loi: string };

/** Nút xoá dùng chung: hỏi xác nhận rồi gọi server action xoa(id). */
export function XoaNut({ id, xoa, xacNhan }: { id: string; xoa: (id: string) => Promise<KQ>; xacNhan: string }) {
  return <Nut chay={() => xoa(id)} nhan="Xoá" kieu="text-red-600" xacNhan={xacNhan} />;
}
