'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';

/** Bộ lọc dùng chung cho toàn bộ dashboard: mọi ô số đều đọc cùng tập đã lọc. */
export function DashFilters({ kyOptions, nhomOptions, statusOptions }: {
  kyOptions: string[];
  nhomOptions: { id: string; ten: string }[];
  statusOptions: [string, string][];
}) {
  const router = useRouter();
  const params = useSearchParams();

  const set = (name: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    value ? next.set(name, value) : next.delete(name);
    router.push(`/?${next.toString()}`);
  };

  const coLoc = ['nhom', 'status'].some((k) => params.get(k));

  return (
    <div className="card card-pad mb-4 no-print">
      <div className="flex items-end justify-between gap-4">
        <div className="grid gap-3 flex-1"
             style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
          <div>
            <label className="label" htmlFor="d-ky">Kỳ bảng kê</label>
            <select id="d-ky" className="field" defaultValue={params.get('ky') ?? ''}
                    onChange={(e) => set('ky', e.target.value)}>
              <option value="">Kỳ hiện tại</option>
              {kyOptions.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="d-nhom">Khách hàng</label>
            <select id="d-nhom" className="field" defaultValue={params.get('nhom') ?? ''}
                    onChange={(e) => set('nhom', e.target.value)}>
              <option value="">Tất cả khách</option>
              {nhomOptions.map((g) => <option key={g.id} value={g.id}>{g.ten}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="d-st">Trạng thái</label>
            <select id="d-st" className="field" defaultValue={params.get('status') ?? ''}
                    onChange={(e) => set('status', e.target.value)}>
              <option value="">Tất cả trạng thái</option>
              {statusOptions.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
        </div>
        {coLoc && <Link href="/" className="btn btn-sm">Bỏ lọc</Link>}
      </div>
    </div>
  );
}
