/**
 * Khung chờ hiện ngay khi bấm chuyển trang.
 *
 * Không có tệp này thì Next.js giữ nguyên trang cũ cho tới khi máy chủ dựng
 * xong trang mới — người dùng bấm vào tab và tưởng như không có gì xảy ra.
 */
export default function Loading() {
  return (
    <div className="animate-pulse">
      <div className="mb-6">
        <div className="h-3 w-28 bg-[var(--line)] rounded mb-2.5" />
        <div className="h-7 w-56 bg-[var(--line)] rounded mb-2" />
        <div className="h-3.5 w-96 max-w-full bg-[var(--line-soft)] rounded" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-7">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="card p-4">
            <div className="h-2.5 w-20 bg-[var(--line)] rounded mb-3" />
            <div className="h-8 w-14 bg-[var(--line-soft)] rounded" />
          </div>
        ))}
      </div>

      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--line)]">
          <div className="h-3.5 w-44 bg-[var(--line)] rounded" />
        </div>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="px-4 py-3.5 border-b border-[var(--line-soft)] flex gap-4 items-center">
            <div className="h-3 w-28 bg-[var(--line-soft)] rounded" />
            <div className="h-3 w-20 bg-[var(--line-soft)] rounded" />
            <div className="h-4 w-24 bg-[var(--line-soft)] rounded-full" />
            <div className="h-3 flex-1 bg-[var(--line-soft)] rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
