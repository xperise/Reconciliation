'use client';
import { FormHanhDong, KhoiDuyet, Nut, OGhi } from '../../ui';
import { duyetBuoc, luuGiaiTrinh, taiLaiRaw, xacNhanThayDoi } from '../../actions';

export function XacNhanTatCa({ lanId, con }: { lanId: string; con: number }) {
  if (!con) return <span className="pill pill-stable">Đã xác nhận hết</span>;
  return <Nut chay={() => xacNhanThayDoi(lanId, 'tat_ca')} nhan={`Xác nhận app sửa đúng (${con} ô)`} kieu="btn-primary"
    xacNhan="Xác nhận toàn bộ các ô app tự sửa là đúng theo hợp đồng?" />;
}
export function XacNhanMot({ lanId, id }: { lanId: string; id: number }) {
  return <Nut chay={() => xacNhanThayDoi(lanId, [id])} nhan="Xác nhận" />;
}
export function GiaiTrinh({ id, dau, sua }: { id: number; dau: string; sua: boolean }) {
  if (!sua) return <span className="text-[12px]">{dau || <i className="text-[var(--ink-3)]">Chưa có giải trình</i>}</span>;
  return <OGhi dau={dau} luu={(t) => luuGiaiTrinh(id, t)} placeholder="Giải trình của kế toán (hoặc: đã sửa raw và tải lại)" />;
}
export function TaiLai({ lanId }: { lanId: string }) {
  return (
    <FormHanhDong action={taiLaiRaw} nhanNut="Tải lại raw đã sửa" kieu="">
      <input type="hidden" name="id" value={lanId} />
      <input type="file" name="raw" accept=".xlsx" multiple required className="text-[12px]" />
      <span className="text-[11px] text-[var(--ink-3)]">Chọn lại đủ cả file khách sạn và vé. Mọi duyệt của vòng hiện tại sẽ mất hiệu lực.</span>
    </FormHanhDong>
  );
}
export function Duyet({ lanId, buoc, nhan, xacNhan }: { lanId: string; buoc: 'ke_toan' | 'demand' | 'supply' | 'ceo'; nhan?: string; xacNhan?: string }) {
  return <KhoiDuyet duyet={(q, y) => duyetBuoc(lanId, buoc, q, y)} nhanDuyet={nhan} xacNhanDuyet={xacNhan} />;
}
