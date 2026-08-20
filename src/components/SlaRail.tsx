/**
 * Thanh escalate. Ba đoạn tương ứng L1 / L2 / L3, tô màu dần theo mức đã
 * nhắc; số vòng lặp hiện bên phải khi khách đã bị nhắc lại từ đầu.
 */
export function SlaRail({
  level, loops, maxLevel = 3,
}: { level: number; loops: number; maxLevel?: number }) {
  return (
    <span
      className="rail"
      title={`Đã nhắc tới cấp L${level || 0}${loops ? `, vòng ${loops + 1}` : ''}`}
    >
      {[1, 2, 3].map((i) => (
        <span
          key={i}
          className="rail-seg"
          data-on={i <= level ? String(Math.min(i, 3)) : undefined}
          style={i > maxLevel ? { opacity: 0.35 } : undefined}
        />
      ))}
      {loops > 0 && <span className="rail-loop">×{loops + 1}</span>}
    </span>
  );
}
