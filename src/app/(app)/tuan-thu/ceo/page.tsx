import Link from 'next/link';
import { PageHeader } from '@/components/PageHeader';
import { nguoiTT, coQuyen, fmtVnd, TEN_BUOC } from '@/lib/tuan-thu/db';
import { tomTatKy, thangHienTai } from '@/lib/tuan-thu/bao-cao-ceo';

export const dynamic = 'force-dynamic';

/** Tổng quan kỳ cho CEO: đã gửi, đang chờ, chặn, trả về, và việc cần CEO quyết. Chỉ đọc. */
export default async function Page({ searchParams }: { searchParams: { thang?: string } }) {
  const n = await nguoiTT();
  if (!n || !(n.phong_ban === 'ceo' || coQuyen(n, 'xem_bao_cao'))) {
    return <p className="p-6 text-[var(--ink-2)]">Trang này dành cho CEO hoặc người được cấp quyền xem báo cáo.</p>;
  }
  const thang = searchParams.thang || thangHienTai();
  const t = await tomTatKy(thang);
  const the = [
    ['Lần chạy trong kỳ', String(t.soLanChay)],
    ['Đã gửi khách', String(t.soDaGui)],
    ['Tổng tiền đã gửi', fmtVnd(t.tongTienDaGui)],
    ['Đang chờ', String(t.soDangCho)],
    ['Chặn đang mở', String(t.soChanDangMo)],
    ['Trả về trong kỳ', String(t.soTraVe)],
  ];
  return (
    <>
      <PageHeader eyebrow="Tuân thủ bảng kê" title={`Tổng quan CEO · ${thang}`}
        description="Chỉ đọc. Quyết định duyệt, chặn, trả về thực hiện ở trang lần chạy hoặc qua agent (bấm Thực hiện)." />
      <form className="mb-4 flex items-center gap-2">
        <input type="month" name="thang" defaultValue={thang} className="field" />
        <button className="btn btn-sm">Xem kỳ</button>
      </form>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 mb-5">
        {the.map(([nhan, gia]) => (
          <div key={nhan} className="card card-pad">
            <div className="text-[12px] text-[var(--ink-2)]">{nhan}</div>
            <div className="text-[20px] font-semibold tabular-nums">{gia}</div>
          </div>
        ))}
      </div>
      <section className="card card-pad mb-5">
        <h2 className="card-title mb-2">Đang chờ theo bước</h2>
        {Object.keys(t.choTheoBuoc).length === 0 ? <p className="text-[var(--ink-2)]">Không có lần chạy đang chờ.</p> : (
          <ul className="text-[13px] space-y-1">
            {Object.entries(t.choTheoBuoc).map(([b, c]) => <li key={b}>{TEN_BUOC[b] ?? b}: <b>{c}</b></li>)}
          </ul>
        )}
      </section>
      <section className="card card-pad">
        <h2 className="card-title mb-2">Cần CEO quyết</h2>
        {t.canQuyet.length === 0 ? <p className="text-[var(--ink-2)]">Không có việc cần quyết trong kỳ này.</p> : (
          <ul className="text-[13px] space-y-1">
            {t.canQuyet.map((c) => (
              <li key={c.id}>
                <Link className="underline" href={`/tuan-thu/chay/${c.id}`}>{c.ma_khach}{c.dot ? ` · đợt ${c.dot}` : ''}</Link>
                {' '}— {TEN_BUOC[c.buoc] ?? c.buoc}{c.tong_hop != null ? ` · ${fmtVnd(c.tong_hop)}` : ''}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
