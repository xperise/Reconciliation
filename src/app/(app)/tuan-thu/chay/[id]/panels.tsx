'use client';
import { useState } from 'react';
import { FormHanhDong, KhoiDuyet, Nut, OGhi } from '../../ui';
import { chanLanChay, duyetBuoc, goChan, luuGiaiTrinh, taiLaiRaw, xacNhanThayDoi } from '../../actions';

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

/** Demand/Supply kiểm soát: không duyệt; chỉ chặn (CEO không duyệt được) hoặc trả về kế toán. */
export function KiemSoat({ lanId, pb, coTraVe }: { lanId: string; pb: 'demand' | 'supply'; coTraVe: boolean }) {
  const [y, setY] = useState('');
  return (
    <div className="flex flex-col gap-2">
      <textarea className="field text-[12px]" rows={2} placeholder="Lý do (bắt buộc khi chặn hoặc trả về)" value={y} onChange={(e) => setY(e.target.value)} />
      <div className="flex gap-2 flex-wrap">
        <Nut chay={() => chanLanChay(lanId, pb, y)} nhan="Chặn bảng kê" kieu="btn-danger" xacNhan="Chặn bảng kê này? CEO sẽ không duyệt được cho tới khi gỡ chặn." />
        {coTraVe && <Nut chay={() => duyetBuoc(lanId, pb, 'tra_ve', y)} nhan="Trả về kế toán" />}
      </div>
    </div>
  );
}
export function GoChan({ id }: { id: number }) {
  return <OGhi dau="" luu={(t) => goChan(id, t)} nhan="Gỡ chặn" placeholder="Ghi chú khi gỡ (đã xử lý thế nào)" />;
}
