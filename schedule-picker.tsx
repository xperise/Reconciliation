'use client';
import { useState } from 'react';
import { Schedules } from './schedules';
import { BillingSchedule } from '@/lib/types';

/** Chọn một nhóm để xem và sửa lịch gửi của nhóm đó. */
export function SchedulePicker({ groups, lichs, chon }: {
  groups: { id: string; ten_nhom: string; ma_he_thong: string }[];
  lichs: BillingSchedule[];
  chon?: string;
}) {
  const [groupId, setGroupId] = useState(chon ?? groups[0]?.id ?? '');
  const nhom = groups.find((g) => g.id === groupId);
  const cua = lichs.filter((l) => l.group_id === groupId);

  const nhieuDot = new Set(lichs.filter((l) => l.enabled).map((l) => l.group_id));
  const demNhieu = groups.filter((g) =>
    lichs.filter((l) => l.group_id === g.id).length > 1).length;

  return (
    <div className="flex flex-col gap-3">
      <div className="card card-pad no-print">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div style={{ minWidth: 320 }}>
            <label className="label" htmlFor="sp-nhom">Xem lịch gửi của nhóm</label>
            <select id="sp-nhom" className="field" value={groupId}
                    onChange={(e) => setGroupId(e.target.value)}>
              {groups.map((g) => {
                const n = lichs.filter((l) => l.group_id === g.id).length;
                return (
                  <option key={g.id} value={g.id}>
                    {g.ten_nhom} ({g.ma_he_thong}){n > 1 ? ` — ${n} đợt` : ''}
                  </option>
                );
              })}
            </select>
          </div>
          <p className="card-note m-0 max-w-[46ch] text-right">
            {demNhieu > 0
              ? `${demNhieu} nhóm đang có nhiều hơn một đợt trong tháng.`
              : 'Chưa nhóm nào khai nhiều đợt. Thêm đợt khi khách nhận bảng kê nhiều lần mỗi tháng.'}
          </p>
        </div>
      </div>

      {nhom && <Schedules groupId={nhom.id} tenNhom={nhom.ten_nhom} lich={cua} />}
    </div>
  );
}
