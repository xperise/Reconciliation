'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { GroupEditor } from './group-editor';

export function MasterTable({ groups }: { groups: any[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<any | null | undefined>(undefined);

  const dong = () => { setEditing(undefined); router.refresh(); };

  return (
    <>
      <div className="flex justify-end mb-3">
        <button className="btn btn-primary" onClick={() => setEditing(null)}>Thêm nhóm</button>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Mã hệ thống</th><th>Tên nhóm</th><th className="text-right">Điểm</th>
                <th className="text-right">Nhóm</th><th className="text-right">Ngày gửi</th>
                <th className="text-right">SLA</th><th>Pháp nhân</th><th>Đầu mối L1</th><th></th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <tr key={g.id} style={g.ngung_hop_tac ? { opacity: 0.5 } : undefined}>
                  <td className="mono font-medium">{g.ma_he_thong}</td>
                  <td className="font-semibold">
                    {g.ten_nhom}
                    {g.ngung_hop_tac && <span className="badge badge-slate ml-2">Ngưng</span>}
                  </td>
                  <td className="text-right tnum">{g.tong_diem || '—'}</td>
                  <td className="text-right">
                    <span className={`badge ${g.nhom_escalate === 3 ? 'badge-red'
                      : g.nhom_escalate === 2 ? 'badge-amber' : 'badge-teal'}`}>
                      {g.nhom_escalate}
                    </span>
                  </td>
                  <td className="text-right tnum">
                    {g.ngay_gui_bang_ke_thuc_te ?? g.ngay_gui_bang_ke_hd ?? '—'}
                  </td>
                  <td className="text-right tnum">
                    {g.sla_chap_nhan_thuc_te ?? g.sla_chap_nhan_hd ?? '—'}
                  </td>
                  <td className="tnum text-[var(--muted)]">{g.customers?.[0]?.count ?? 0}</td>
                  <td className="text-xs max-w-[220px] truncate" title={g.email_l1 ?? ''}>
                    {g.email_l1 ?? <span className="text-[var(--red)]">chưa khai báo</span>}
                  </td>
                  <td className="text-right">
                    <button className="btn btn-sm" onClick={() => setEditing(g)}>Sửa</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!groups.length && (
          <p className="empty">
            <strong>Chưa có nhóm đối soát nào.</strong>
            Thêm nhóm đầu tiên, hoặc nhập hàng loạt bằng tệp SQL trong thư mục supabase.
          </p>
        )}
      </div>

      {editing !== undefined && <GroupEditor group={editing} onClose={dong} />}
    </>
  );
}
