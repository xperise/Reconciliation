import { currentUser } from '@/lib/supabase/server';
import { PageHeader } from '@/components/PageHeader';
import { NhanLoiMoi } from './nhan-loi-moi';

export const dynamic = 'force-dynamic';

/** Trang nhận lời mời tham gia Tuân thủ bảng kê (đường dẫn trong email). */
export default async function Page({ searchParams }: { searchParams: { ma?: string } }) {
  const ma = searchParams.ma ?? '';
  const u = await currentUser();
  return (
    <>
      <PageHeader eyebrow="Tuân thủ bảng kê" title="Lời mời tham gia" description="Lời mời chỉ dùng được một lần, trong 7 ngày, với đúng email đã được mời." />
      <div className="card card-pad max-w-xl">
        {!ma ? <p>Đường dẫn không có mã lời mời.</p>
          : !u ? <p>Hãy đăng nhập bằng email được mời, rồi mở lại đường dẫn này.</p>
          : <NhanLoiMoi ma={ma} />}
      </div>
    </>
  );
}
