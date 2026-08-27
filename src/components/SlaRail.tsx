/**
 * Huy hiệu tiến trình escalate, dùng chung ở mọi màn hình.
 * Thanh 34px hiện mức đã leo tới, vạch mảnh đánh dấu mức tối đa của nhóm,
 * chữ bên phải ghi cấp hiện tại trên tổng số cấp và số vòng lặp.
 */
export function SlaRail({ level, loops, maxLevel = 3 }: {
  level: number; loops: number; maxLevel?: number;
}) {
  const fill = maxLevel > 0 ? Math.min(level / maxLevel, 1) : 0;
  const tone = level >= 3 ? 'var(--critical)' : level === 2 ? 'var(--high)' : 'var(--stable)';

  return (
    <span className="prog" title={`Đã nhắc tới cấp L${level || 0}/${maxLevel}${loops ? `, vòng ${loops + 1}` : ''}`}>
      <span className="prog-track">
        {level > 0 && <span className="prog-fill" style={{ width: `${fill * 100}%`, background: tone }} />}
        <span className="prog-tick" style={{ left: '100%' }} />
      </span>
      <span className="prog-txt">
        {level > 0 ? `L${level}/${maxLevel}` : '—'}{loops > 0 ? `·×${loops + 1}` : ''}
      </span>
    </span>
  );
}
