import { PageHeader } from '@/components/PageHeader';
import { GuideContent } from './guide-content';

export const dynamic = 'force-dynamic';

export default function GuidePage() {
  return (
    <>
      <PageHeader
        eyebrow="Tài liệu vận hành"
        title="Hướng dẫn sử dụng"
        description="SOP dạng tương tác — chọn vai trò để xem đúng phần cần làm."
      />
      <GuideContent />
    </>
  );
}
