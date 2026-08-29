'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { donKhoTep } from '@/app/actions';

/**
 * Dọn kho tệp. Chỉ admin, và phải gõ đúng một từ để xác nhận.
 *
 * Việc này không hoàn tác được và cũng không có thùng rác, nên một hộp
 * thoại "bạn có chắc không" là chưa đủ — gõ tay buộc người dùng dừng lại
 * đủ lâu để đọc xem mình đang xoá cái gì.
 */
export function PurgeBox({ soTep, nhomList }: {
  soTep: number;
  nhomList: { ma_he_thong: string; ten_nhom: string }[];
}) {
  const router = useRouter();
  const [mo, setMo] = useState(false);
  const [pham, setPham] = useState('');       // rỗng = toàn bộ
  const [xacNhan, setXacNhan] = useState('');
  const [ketQua, setKetQua] = useState('');
  const [loi, setLoi] = useState('');
  const [dangChay, start] = useTransition();

  const tenPham = pham
    ? nhomList.find((n) => n.ma_he_thong === pham)?.ten_nhom ?? pham
    : 'toàn bộ kho';

  function chay() {
    setLoi('');
    start(async () => {
      try {
        const r = await donKhoTep(pham || undefined);
        setKetQua(`Đã xoá ${r.soTep} tệp khỏi ${tenPham}.`);
        setMo(false);
        setXacNhan('');
        router.refresh();
      } catch (e) {
        setLoi(e instanceof Error ? e.message : 'Không dọn được.');
      }
    });
  }

  if (!mo) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn btn-danger btn-sm" onClick={() => { setMo(true); setKetQua(''); }}>
          Dọn sạch kho tệp
        </button>
        {ketQua && <span className="text-[11.5px]" style={{ color: 'var(--stable)' }}>{ketQua}</span>}
      </div>
    );
  }

  return (
    <div className="card card-pad flex flex-col gap-3" data-status="critical">
      <div>
        <p className="eyebrow" style={{ color: 'var(--critical)' }}>Không hoàn tác được</p>
        <p className="text-[12.5px] m-0 mt-1 leading-relaxed">
          Xoá tệp thật khỏi kho và xoá luôn siêu dữ liệu tương ứng. Kho không có
          thùng rác. Dùng khi kết thúc một đợt kiểm thử.
        </p>
      </div>

      <div>
        <label className="label" htmlFor="pg-pham">Phạm vi</label>
        <select id="pg-pham" className="field" value={pham} onChange={(e) => setPham(e.target.value)}>
          <option value="">Toàn bộ kho — {soTep} tệp</option>
          {nhomList.map((n) => (
            <option key={n.ma_he_thong} value={n.ma_he_thong}>
              Chỉ {n.ten_nhom} ({n.ma_he_thong})
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="label" htmlFor="pg-xn">
          Gõ <span className="mono" style={{ textTransform: 'none' }}>XOA</span> để xác nhận
        </label>
        <input id="pg-xn" className="field mono" value={xacNhan}
               onChange={(e) => setXacNhan(e.target.value)} placeholder="XOA" />
      </div>

      {loi && <p role="alert" className="callout callout-critical m-0">{loi}</p>}

      <div className="flex gap-2">
        <button className="btn btn-danger btn-sm" onClick={chay}
                disabled={dangChay || xacNhan.trim().toUpperCase() !== 'XOA'}>
          {dangChay ? 'Đang dọn…' : `Xoá tệp trong ${tenPham}`}
        </button>
        <button className="btn btn-sm" onClick={() => { setMo(false); setXacNhan(''); setLoi(''); }}
                disabled={dangChay}>
          Hủy
        </button>
      </div>
    </div>
  );
}
