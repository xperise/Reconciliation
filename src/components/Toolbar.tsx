'use client';
import { useRouter, useSearchParams } from 'next/navigation';

/** Ô lọc dùng chung cho các trang bảng. Ghi trạng thái lọc vào URL. */
export function FilterBar({ fields }: {
  fields: { name: string; label: string; options?: { value: string; label: string }[] }[];
}) {
  const router = useRouter();
  const params = useSearchParams();

  const update = (name: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    value ? next.set(name, value) : next.delete(name);
    router.push(`?${next.toString()}`);
  };

  return (
    <div className="flex flex-wrap gap-3 items-end">
      {fields.map((f) => (
        <div key={f.name} className="min-w-[170px]">
          <label className="label" htmlFor={`f-${f.name}`}>{f.label}</label>
          {f.options ? (
            <select
              id={`f-${f.name}`}
              className="field"
              defaultValue={params.get(f.name) ?? ''}
              onChange={(e) => update(f.name, e.target.value)}
            >
              <option value="">Tất cả</option>
              {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          ) : (
            <input
              id={`f-${f.name}`}
              className="field"
              defaultValue={params.get(f.name) ?? ''}
              placeholder="Nhập để tìm"
              onKeyDown={(e) => {
                if (e.key === 'Enter') update(f.name, (e.target as HTMLInputElement).value);
              }}
            />
          )}
        </div>
      ))}
    </div>
  );
}
