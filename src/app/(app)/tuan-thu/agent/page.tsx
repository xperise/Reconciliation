import Link from 'next/link';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { PageHeader } from '@/components/PageHeader';
import { duocLam, nguoiTT } from '@/lib/tuan-thu/db';
import { PhongBan, TEN_PHONG_BAN } from '@/lib/tuan-thu/types';
import { ChatAgent, GoiYSkill, SuaSkill } from '../agent-ui';

export const dynamic = 'force-dynamic';
const PB: PhongBan[] = ['ke_toan', 'demand', 'supply', 'ceo'];

export default async function Page({ searchParams }: { searchParams: { pb?: string } }) {
  const n = (await nguoiTT())!;
  const choPhep = PB.filter((p) => duocLam(n, p));
  const pb = (choPhep.includes(searchParams.pb as PhongBan) ? searchParams.pb : n.phong_ban ?? choPhep[0]) as PhongBan;
  const sb = supabaseAdmin();
  const [{ data: sk, error }, { data: gy }, { data: chat }, { data: dung }] = await Promise.all([
    sb.from('tt_skill').select('*').eq('phong_ban', pb).order('phien_ban', { ascending: false }),
    sb.from('tt_skill_goi_y').select('*').eq('phong_ban', pb).eq('trang_thai', 'cho').order('luc', { ascending: false }),
    sb.from('tt_chat').select('phong_ban, vai, noi_dung').eq('user_id', n.id).is('lan_chay_id', null).order('luc'),
    sb.from('tt_duyet').select('skill_phien_ban').eq('buoc', pb),
  ]);
  if (error) return <div className="callout callout-high">Chưa chạy <code>supabase/migrations/39_tuan_thu_agent.sql</code> — chưa có bảng skill.</div>;
  const hienHanh = (sk ?? [])[0] as any;
  const lichSu: any = {}; for (const m of (chat ?? []) as any[]) (lichSu[m.phong_ban] ??= []).push({ vai: m.vai, noi_dung: m.noi_dung });
  const soLanDung = (v: number) => ((dung ?? []) as any[]).filter((d) => d.skill_phien_ban === v).length;
  return (
    <>
      <PageHeader eyebrow="Tuân thủ bảng kê" title={`Agent ${TEN_PHONG_BAN[pb]}`}
        description="Skill là bộ hướng dẫn agent đọc mỗi lần làm việc (chat, rà soát bước duyệt, phân tích sửa đổi). Sửa skill tạo phiên bản mới; mỗi lần duyệt ghi lại phiên bản skill đang dùng. Khi head duyệt khác đề xuất của agent, app tạo gợi ý bổ sung skill để head nhận hoặc bỏ qua."
        action={choPhep.length > 1 ? <div className="flex gap-1">{choPhep.map((p) => <Link key={p} href={`/tuan-thu/agent?pb=${p}`} className={`btn btn-sm ${p === pb ? 'btn-primary' : ''}`}>{TEN_PHONG_BAN[p]}</Link>)}</div> : undefined} />
      <div className="grid gap-4 md:grid-cols-2">
        <section className="card card-pad">
          <h2 className="card-title mb-2">Skill hiện hành — v{hienHanh?.phien_ban}</h2>
          {hienHanh && <SuaSkill key={`${pb}-${hienHanh.phien_ban}`} pb={pb} dau={hienHanh.noi_dung} phienBan={hienHanh.phien_ban} />}
        </section>
        <div>
          <section className="card card-pad mb-4">
            <h2 className="card-title mb-2">Gợi ý bổ sung skill (học từ quyết định)</h2>
            {(gy ?? []).length === 0 ? <p className="empty">Chưa có gợi ý. Gợi ý xuất hiện khi head duyệt khác đề xuất của agent và ghi lý do.</p>
              : (gy ?? []).map((g: any) => (
                <div key={g.id} className="callout callout-accent mb-2 text-[12.5px]">
                  <div className="text-[11px] mb-1">{g.nguon}</div>{g.noi_dung}
                  <div className="mt-2"><GoiYSkill id={g.id} /></div>
                </div>))}
          </section>
          <section className="card card-pad">
            <h2 className="card-title mb-2">Lịch sử phiên bản</h2>
            <table className="tbl"><thead><tr><th>Bản</th><th>Lúc</th><th>Lý do</th><th className="text-right">Số lần duyệt dùng</th></tr></thead>
              <tbody>{(sk ?? []).map((x: any) => (
                <tr key={x.id}><td>v{x.phien_ban}</td><td className="text-xs">{new Date(x.luc).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}</td><td className="text-[12px]">{x.ly_do}</td><td className="text-right">{soLanDung(x.phien_ban)}</td></tr>))}</tbody></table>
            <details className="mt-2"><summary className="text-[12px] cursor-pointer">Xem nội dung các bản cũ</summary>
              {(sk ?? []).slice(1).map((x: any) => <div key={x.id} className="mt-2"><b className="text-[12px]">v{x.phien_ban}</b><pre className="text-[11.5px] whitespace-pre-wrap">{x.noi_dung}</pre></div>)}</details>
          </section>
        </div>
      </div>
      <ChatAgent lanChayId={null} pbs={[pb]} lichSu={lichSu} nhanNgCanh="Bộ quy tắc" />
    </>
  );
}
