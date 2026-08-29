'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';

/**
 * Thanh lọc dùng chung. Mọi điều kiện đi qua URL nên trạng thái lọc chia sẻ
 * được bằng đường dẫn, và các ô KPI trên dashboard trỏ thẳng vào đây.
 */
export function Filters({ kyOptions, statusOptions, dem }: {
  kyOptions: string[];
  statusOptions: [string, string][];
  dem: { qua_han: number; can_han: number; xu_ly_tay: number;
         cho_noi_bo: number; da_chot: number };
}) {
  const router = useRouter();
  const params = useSearchParams();

  const set = (name: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    value ? next.set(name, value) : next.delete(name);
    router.push(`?${next.toString()}`);
  };

  const coLoc = ['ky', 'status', 'nhom', 'loc'].some((k) => params.get(k));

  return (
    <div className="card card-pad mb-4 no-print">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="flex flex-wrap gap-2">
          <Link href="/tracking?loc=qua_han" className="chip"
                data-on={params.get('loc') === 'qua_han'} data-zero={dem.qua_han === 0}>
            Quá hạn <span className="chip-count">{dem.qua_han}</span>
          </Link>
          <Link href="/tracking?loc=can_han" className="chip"
                data-on={params.get('loc') === 'can_han'} data-zero={dem.can_han === 0}>
            Cận hạn 24 giờ <span className="chip-count">{dem.can_han}</span>
          </Link>
          <Link href="/tracking?loc=cho_noi_bo" className="chip"
                data-on={params.get('loc') === 'cho_noi_bo'} data-zero={dem.cho_noi_bo === 0}>
            Chờ nội bộ xử lý <span className="chip-count">{dem.cho_noi_bo}</span>
          </Link>
          <Link href="/tracking?status=can_xu_ly_tay" className="chip"
                data-on={params.get('status') === 'can_xu_ly_tay'} data-zero={dem.xu_ly_tay === 0}>
            Cần xử lý tay <span className="chip-count">{dem.xu_ly_tay}</span>
          </Link>
          <Link href="/tracking?loc=da_chot" className="chip"
                data-on={params.get('loc') === 'da_chot'} data-zero={dem.da_chot === 0}>
            Đã chốt <span className="chip-count">{dem.da_chot}</span>
          </Link>
        </div>
        {coLoc && (
          <Link href="/tracking" className="btn btn-sm">Bỏ lọc</Link>
        )}
      </div>

      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
        <div>
          <label className="label" htmlFor="f-ky">Kỳ đối soát</label>
          <select id="f-ky" className="field" defaultValue={params.get('ky') ?? ''}
                  onChange={(e) => set('ky', e.target.value)}>
            <option value="">Tất cả</option>
            {kyOptions.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="f-st">Trạng thái</label>
          <select id="f-st" className="field" defaultValue={params.get('status') ?? ''}
                  onChange={(e) => set('status', e.target.value)}>
            <option value="">Tất cả</option>
            {statusOptions.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="f-nhom">Tên nhóm</label>
          <input id="f-nhom" className="field" defaultValue={params.get('nhom') ?? ''}
                 placeholder="Gõ rồi nhấn Enter"
                 onKeyDown={(e) => {
                   if (e.key === 'Enter') set('nhom', (e.target as HTMLInputElement).value);
                 }} />
        </div>
      </div>
    </div>
  );
}
