'use client';
// Trang "Sắp xếp sơ đồ & chặng" (chỉ người có quyền sửa) — xong / huỷ thì quay về Tổng quan
import type { Guide } from '@/lib/guide/meta';
import JourneyEditor from './JourneyEditor';
type Lib = Record<string, Pick<Guide, 'slug' | 'title' | 'audience' | 'sections' | 'status'>>;
export default function JourneyEditorPage({ guide, lib }: { guide: Guide; lib: Lib }) {
  return <JourneyEditor guide={guide} lib={lib} onCancel={() => { location.href = '/huong-dan'; }} />;
}
