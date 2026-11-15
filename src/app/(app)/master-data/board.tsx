'use client';
import { useState } from 'react';
import { MasterGrid } from './grid';
import { Schedules } from './schedules';
import { PhapNhan } from './phap-nhan';
import { BillingSchedule } from '@/lib/types';
import { useRouter } from 'next/navigation';
import { dongBoKhachTuDashboard } from '@/app/actions';

/**
 * Ba khu của Master Data dùng chung một nhóm đang chọn: lưới ở trên, lịch gửi
 * và pháp nhân ở dưới. Bấm nút Lịch trên một dòng là hai khu dưới nhảy theo,
 * không phải tự dò lại trong danh sách bốn mươi nhóm.
 */
export function MasterBoard({ rows, lichs, phapNhan, laKeToan, chonBanDau }: {
  rows: any[];
  lichs: BillingSchedule[];
  phapNhan: any[];
  laKeToan: boolean;
  chonBanDau?: string;
}) {
  const [groupId, setGroupId] = useState(chonBanDau ?? rows[0]?.id ?? '');
  const router = useRouter();
  const [dongBo, setDongBo] = useState<{ chay: boolean; msg: string; loi?: boolean }>({ chay: false, msg: '' });
  async function chayDongBo() {
    setDongBo({ chay: true, msg: '' });
    try {
      const r = await dongBoKhachTuDashboard();
      if (r.error) throw new Error(r.error);
      setDongBo({ chay: false, msg: r.phapNhanMoi.length
        ? `Đã thêm ${r.phapNhanMoi.length} khách (${r.nhomMoi.length} nhóm mới, chưa có lịch gửi): ${r.phapNhanMoi.slice(0, 12).join(', ')}${r.phapNhanMoi.length > 12 ? '…' : ''}`
        : 'Master Data đã có đủ khách Travel của Dashboard.' });
      router.refresh();
    } catch (e) { setDongBo({ chay: false, msg: e instanceof Error ? e.message : 'Không đồng bộ được.', loi: true }); }
  }
  const nhom = rows.find((r) => r.id === groupId);

  const chon = (id: string) => {
    setGroupId(id);
    document.getElementById('khu-chi-tiet')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <>
      {laKeToan && (
        <div className="card card-pad no-print mb-3 flex flex-wrap items-center gap-3">
          <button className="btn btn-sm" onClick={chayDongBo} disabled={dongBo.chay}>
            {dongBo.chay ? 'Đang đồng bộ…' : 'Đồng bộ khách từ Dashboard'}
          </button>
          <p className="card-note m-0">
            Thêm các khách Travel có trong Dashboard mà Master Data chưa có. Cột <b>PM phụ trách</b> ở đây (nhóm, hoặc riêng từng pháp nhân) là PM Dashboard dùng.
          </p>
          {dongBo.msg && <p role="status" className={`callout ${dongBo.loi ? 'callout-critical' : ''} m-0 w-full`}>{dongBo.msg}</p>}
        </div>
      )}
      <MasterGrid rows={rows} laKeToan={laKeToan} onChonNhom={chon} />

      <div id="khu-chi-tiet" className="mt-4 flex flex-col gap-3">
        <div className="card card-pad no-print">
          <label className="label" htmlFor="mb-nhom">Xem chi tiết nhóm</label>
          <div className="flex flex-wrap items-center gap-3">
            <select id="mb-nhom" className="field" style={{ maxWidth: 420 }}
                    value={groupId} onChange={(e) => setGroupId(e.target.value)}>
              {rows.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.ten_nhom} ({r.ma_he_thong})
                  {r.so_dot > 1 ? ` — ${r.so_dot} đợt` : ''}
                  {r.so_phap_nhan ? ` — ${r.so_phap_nhan} pháp nhân` : ''}
                </option>
              ))}
            </select>
            <p className="card-note m-0">
              Lịch gửi và danh sách pháp nhân của nhóm này hiện bên dưới.
            </p>
          </div>
        </div>

        {nhom && (
          <>
            <Schedules
              groupId={nhom.id}
              tenNhom={nhom.ten_nhom}
              lich={lichs.filter((l) => l.group_id === nhom.id)}
            />
            <PhapNhan
              groupId={nhom.id}
              tenNhom={nhom.ten_nhom}
              pmNhom={nhom.pm}
              danhSach={phapNhan.filter((c) => c.group_id === nhom.id)}
            />
          </>
        )}
      </div>
    </>
  );
}
