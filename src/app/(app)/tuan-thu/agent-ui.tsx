'use client';
import { useEffect, useRef, useState, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { boQuaHanhDong, goiYGiaiTrinh, kiemTraClaude, hoiAgent, luuSkill, phanTichSuaDoi, raSoatBuoc, taiChat, thucHienHanhDong, xoaChat, xuLyGoiY } from './actions-agent';
import type { PhongBan } from '@/lib/tuan-thu/types';

/** Hiển thị câu trả lời của agent: in đậm **…**, tiêu đề #, gạch đầu dòng. Không dùng innerHTML. */
function DongChu({ t }: { t: string }) {
  const parts = t.split(/(\*\*[^*]+\*\*)/g);
  return <>{parts.map((x, i) => (x.startsWith('**') && x.endsWith('**') && x.length > 4 ? <strong key={i}>{x.slice(2, -2)}</strong> : <span key={i}>{x}</span>))}</>;
}
export function VanBan({ text }: { text: string }) {
  const dong = text.replace(/\r/g, '').split('\n');
  return (
    <div className="flex flex-col gap-1">
      {dong.map((d, i) => {
        const tr = d.trim();
        if (!tr) return <div key={i} style={{ height: 4 }} />;
        const h = tr.match(/^#{1,4}\s+(.*)$/);
        if (h) return <div key={i} className="font-semibold mt-1"><DongChu t={h[1]} /></div>;
        const b = d.match(/^(\s*)([-*•]|\d+[.)])\s+(.*)$/);
        if (b) return <div key={i} style={{ display: 'flex', gap: 6, paddingLeft: Math.min(b[1].length, 6) * 6 }}><span>{/\d/.test(b[2]) ? b[2] : '•'}</span><span><DongChu t={b[3]} /></span></div>;
        return <div key={i}><DongChu t={d} /></div>;
      })}
    </div>
  );
}

const TEN: Record<PhongBan, string> = { ke_toan: 'Kế toán', demand: 'Demand', supply: 'Supply', ceo: 'CEO' };

type HD = { id: number; mo_ta: string; trang_thai: string; ket_qua: string | null };
type TN = { vai: 'user' | 'assistant'; noi_dung: string; hanh_dong: HD[] };

/** Thẻ thao tác agent đề xuất: chỉ chạy khi người dùng bấm Thực hiện. */
function TheHanhDong({ h, capNhat }: { h: HD; capNhat: (h: HD) => void }) {
  const [dang, bat] = useTransition();
  const router = useRouter();
  const nhan: Record<string, [string, string]> = { cho: ['Chờ xác nhận', 'pill-watch'], da_lam: ['Đã thực hiện', 'pill-stable'], bo_qua: ['Đã bỏ qua', 'pill-neutral'], loi: ['Lỗi', 'pill-critical'] };
  return (
    <div className="rounded-xl border border-[var(--line)] px-3 py-2 text-[12.5px]" style={{ background: 'var(--surface, #fff)' }}>
      <div className="flex items-center gap-2 mb-1"><b>Thao tác #{h.id}</b><span className={`pill ${nhan[h.trang_thai]?.[1]}`}>{nhan[h.trang_thai]?.[0]}</span></div>
      <div>{h.mo_ta}</div>
      {h.ket_qua && <div className="text-[11.5px] mt-1">{h.ket_qua}</div>}
      {h.trang_thai === 'cho' && (
        <div className="flex gap-2 mt-2">
          <button type="button" className="btn btn-sm btn-primary" disabled={dang} onClick={() => bat(async () => {
            let k: any;
            try { k = await thucHienHanhDong(h.id); } catch (e) { k = { ok: false, loi: e instanceof Error ? e.message : String(e) }; }
            capNhat({ ...h, trang_thai: k.ok ? 'da_lam' : 'loi', ket_qua: k.ok ? k.thongBao ?? 'Đã thực hiện.' : k.loi });
            router.refresh();
          })}>{dang ? 'Đang thực hiện…' : 'Thực hiện'}</button>
          <button type="button" className="btn btn-sm" disabled={dang} onClick={() => bat(async () => { await boQuaHanhDong(h.id); capNhat({ ...h, trang_thai: 'bo_qua' }); })}>Bỏ qua</button>
        </div>
      )}
    </div>
  );
}

/**
 * Khung làm việc với agent, có ở mọi trang của phần Tuân thủ (như Cowork).
 * Ở trang một lần chạy, agent tự gắn với lần chạy đó.
 */
export function ChatAgent({ pbs }: { pbs: PhongBan[] }) {
  const path = usePathname() ?? '';
  const lanChayId = path.match(/^\/tuan-thu\/chay\/([0-9a-f-]{36})/)?.[1] ?? null;
  const [mo, setMo] = useState(false);
  const [pb, setPb] = useState<PhongBan>(pbs[0]);
  const [ds, setDs] = useState<TN[]>([]);
  const [q, setQ] = useState('');
  const [dang, bat] = useTransition();
  const [loi, setLoi] = useState('');
  const cuon = useRef<HTMLDivElement>(null);
  useEffect(() => { if (mo && pbs.length) taiChat(lanChayId, pb).then(setDs).catch(() => setDs([])); }, [mo, pb, lanChayId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { cuon.current?.scrollTo(0, 1e9); }, [ds, mo, dang]);
  if (!pbs.length) return null;
  const capNhatHd = (h: HD) => setDs((x) => x.map((m) => ({ ...m, hanh_dong: m.hanh_dong.map((y) => (y.id === h.id ? h : y)) })));
  const gui = (cau: string) => {
    if (!cau.trim()) return;
    setQ(''); setLoi('');
    setDs((x) => [...x, { vai: 'user', noi_dung: cau, hanh_dong: [] }]);
    bat(async () => {
      let k: Awaited<ReturnType<typeof hoiAgent>>;
      try { k = await hoiAgent(lanChayId, pb, cau); } catch (e) { k = { ok: false, loi: e instanceof Error ? e.message : String(e) }; }
      if (k.ok) setDs((x) => [...x, { vai: 'assistant', noi_dung: k.text, hanh_dong: k.hanh_dong }]);
      else setLoi(k.loi);
    });
  };
  const goiY = lanChayId
    ? ['Tóm tắt lần chạy này và việc còn phải làm', 'Ghi giải trình cho các cảnh báo còn trống', 'Duyệt bước của tôi nếu đủ điều kiện']
    : ['Lần chạy nào đang chờ tôi?', 'Hợp đồng VCB quy định định mức phòng thế nào?', 'Đề xuất sửa đổi nào đang chờ tôi duyệt?'];
  return (
    <>
      {!mo && <button type="button" className="btn btn-primary no-print" onClick={() => setMo(true)}
        style={{ position: 'fixed', right: 16, bottom: 'calc(16px + env(safe-area-inset-bottom, 0px))', zIndex: 40, borderRadius: 999, padding: '10px 18px', boxShadow: '0 8px 24px rgba(0,0,0,.18)' }}>
        Làm việc với agent</button>}
      {mo && (
        <section aria-label="Làm việc với agent" className="card no-print"
          style={{ position: 'fixed', right: 16, bottom: 'calc(16px + env(safe-area-inset-bottom, 0px))', zIndex: 50, width: 'min(480px, calc(100vw - 32px))', height: 'min(680px, calc(100vh - 110px))', display: 'flex', flexDirection: 'column', padding: 0, boxShadow: '0 12px 28px rgba(0,0,0,.2)' }}>
          <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--line)]">
            <b className="text-[13px]">Agent</b>
            {pbs.length > 1 ? (
              <select className="field !py-1 !w-auto text-[12px]" value={pb} onChange={(e) => setPb(e.target.value as PhongBan)}>
                {pbs.map((p) => <option key={p} value={p}>{TEN[p]}</option>)}</select>
            ) : <span className="pill pill-neutral">{TEN[pb]}</span>}
            <span className="text-[11px] text-[var(--ink-3)] truncate">{lanChayId ? 'Lần chạy đang mở' : 'Chung'}</span>
            <span className="ml-auto" />
            <button type="button" className="btn btn-sm" onClick={() => bat(async () => { await xoaChat(lanChayId, pb); setDs([]); })}>Xóa</button>
            <button type="button" className="btn btn-sm" onClick={() => setMo(false)}>Đóng</button>
          </div>
          <div ref={cuon} className="flex-1 overflow-auto px-4 py-3 flex flex-col gap-2">
            {ds.length === 0 && (
              <div className="text-[12px] text-[var(--ink-3)] flex flex-col gap-2">
                <div>Nhắn cho agent {TEN[pb]} để hỏi hoặc giao việc: sửa ô bảng kê, ghi giải trình, duyệt, trả về, chặn, đề xuất sửa quy tắc… Agent chuẩn bị thao tác, anh/chị bấm Thực hiện thì mới chạy.</div>
                <div className="flex flex-wrap gap-1">{goiY.map((g) => <button key={g} type="button" className="btn btn-sm" onClick={() => gui(g)}>{g}</button>)}</div>
              </div>
            )}
            {ds.map((m, i) => (
              <div key={i} className="flex flex-col gap-2" style={{ alignSelf: m.vai === 'user' ? 'flex-end' : 'stretch', maxWidth: m.vai === 'user' ? '92%' : '100%' }}>
                <div className="text-[12.5px] rounded-xl px-3 py-2"
                  style={{ whiteSpace: m.vai === 'user' ? 'pre-wrap' : 'normal', background: m.vai === 'user' ? 'var(--accent-soft, #edfaf8)' : 'var(--surface-2, #f0f0f2)' }}>
                  {m.vai === 'user' ? m.noi_dung : <VanBan text={m.noi_dung} />}</div>
                {m.hanh_dong.map((h) => <TheHanhDong key={h.id} h={h} capNhat={capNhatHd} />)}
              </div>
            ))}
            {dang && <div className="text-[12px] text-[var(--ink-3)]">Agent đang làm việc…</div>}
            {loi && <div className="text-[12px] text-red-600">{loi}</div>}
          </div>
          <form className="flex gap-2 p-3 border-t border-[var(--line)]" onSubmit={(e) => { e.preventDefault(); gui(q); }}>
            <input className="field flex-1" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nhắn cho agent…" disabled={dang} />
            <button className="btn btn-primary" disabled={dang || !q.trim()}>Gửi</button>
          </form>
        </section>
      )}
    </>
  );
}

function NutAI({ chay, nhan, dangNhan }: { chay: () => Promise<{ ok: boolean; loi?: string; thongBao?: string }>; nhan: string; dangNhan: string }) {
  const [dang, bat] = useTransition();
  const [tb, setTb] = useState<{ loi: boolean; t: string } | null>(null);
  const router = useRouter();
  return (
    <span className="inline-flex flex-col gap-1">
      <button type="button" className="btn btn-sm" disabled={dang} onClick={() => bat(async () => {
        let k: any;
        try { k = await chay(); } catch (e) { k = { ok: false, loi: e instanceof Error ? e.message : String(e) }; }
        setTb(k.ok ? (k.thongBao ? { loi: false, t: k.thongBao } : null) : { loi: true, t: k.loi });
        if (k.ok) router.refresh();
      })}>{dang ? dangNhan : nhan}</button>
      {tb && <span className={`text-[11.5px] ${tb.loi ? 'text-red-600' : 'text-emerald-700'}`}>{tb.t}</span>}
    </span>
  );
}

export function RaSoat({ lanChayId, buoc, ketQua }: { lanChayId: string; buoc: PhongBan; ketQua?: { noi_dung: string; luc: string; skill_phien_ban: number | null } | null }) {
  return (
    <div className="mb-3">
      <NutAI chay={() => raSoatBuoc(lanChayId, buoc)} nhan={`Agent AI ${TEN[buoc]} rà soát`} dangNhan="Agent đang rà soát…" />
      {ketQua && (
        <div className="callout callout-accent mt-2 text-[12.5px]">
          <div className="text-[11px] mb-1">Agent AI · skill v{ketQua.skill_phien_ban ?? '?'} · {new Date(ketQua.luc).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}</div>
          <VanBan text={ketQua.noi_dung} />
        </div>
      )}
    </div>
  );
}

export function GoiYGiaiTrinh({ lanChayId }: { lanChayId: string }) {
  return <NutAI chay={() => goiYGiaiTrinh(lanChayId)} nhan="Nhờ agent Kế toán gợi ý giải trình" dangNhan="Agent đang soạn gợi ý…" />;
}

export function PhanTichSuaDoi({ suaDoiId, pb, ketQua }: { suaDoiId: string; pb: PhongBan; ketQua?: string | null }) {
  return (
    <div className="mt-2">
      <NutAI chay={() => phanTichSuaDoi(suaDoiId, pb)} nhan="Agent AI phân tích tác động" dangNhan="Agent đang phân tích…" />
      {ketQua && <details className="mt-1"><summary className="text-[12px] cursor-pointer">Agent {TEN[pb]} phân tích</summary>
        <div className="text-[12px] mt-1"><VanBan text={ketQua} /></div></details>}
    </div>
  );
}

export function SuaSkill({ pb, dau, phienBan }: { pb: PhongBan; dau: string; phienBan: number }) {
  const [t, setT] = useState(dau); const [ly, setLy] = useState('');
  return (
    <div className="flex flex-col gap-2">
      <textarea className="field text-[12.5px] mono" rows={16} value={t} onChange={(e) => setT(e.target.value)} />
      <input className="field" placeholder="Lý do sửa (ví dụ: bổ sung quy tắc đổi vé VCB)" value={ly} onChange={(e) => setLy(e.target.value)} />
      <div><NutAI chay={() => luuSkill(pb, t, ly)} nhan={`Lưu thành v${phienBan + 1}`} dangNhan="Đang lưu…" /></div>
    </div>
  );
}

export function GoiYSkill({ id }: { id: number }) {
  return (
    <span className="inline-flex gap-2">
      <NutAI chay={() => xuLyGoiY(id, true)} nhan="Thêm vào skill" dangNhan="Đang lưu…" />
      <NutAI chay={() => xuLyGoiY(id, false)} nhan="Bỏ qua" dangNhan="…" />
    </span>
  );
}

export function KiemTraClaude() {
  return <NutAI chay={() => kiemTraClaude()} nhan="Kiểm tra kết nối Claude API" dangNhan="Đang kiểm tra…" />;
}
