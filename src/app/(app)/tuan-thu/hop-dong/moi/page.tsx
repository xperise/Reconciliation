import { supabaseAdmin } from '@/lib/supabase/admin';
import { PageHeader } from '@/components/PageHeader';
import { FormHopDong } from './form';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const { data: nhom } = await supabaseAdmin().from('billing_groups').select('id, ten_nhom, ma_he_thong').order('ten_nhom');
  return (
    <>
      <PageHeader eyebrow="Tuân thủ bảng kê" title="Thêm hợp đồng / khách mới"
        description="Upload hợp đồng và phụ lục (PDF). Agent đọc văn bản: tóm tắt điều khoản, tham số máy, điểm còn mở; agent của từng phòng rút quy tắc theo scope. Kết quả là bản nháp — 4 head chốt quy tắc, CEO kích hoạt, rồi mới chạy bảng kê theo hợp đồng này." />
      <section className="card card-pad"><FormHopDong nhom={(nhom ?? []).map((g: any) => ({ id: g.id, ten: `${g.ten_nhom} (${g.ma_he_thong})` }))} /></section>
    </>
  );
}
