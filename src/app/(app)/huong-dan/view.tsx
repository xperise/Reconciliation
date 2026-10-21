// Dựng trang Hành trình / Thư viện (server) — dùng chung cho /huong-dan, /huong-dan/thu-vien, /huong-dan/[slug]
import GuideHome from '@/components/guide/GuideHome';
import JourneyView from '@/components/guide/JourneyView';
import { isJourney, loadLibrary } from '@/lib/guide/server';
import type { Guide } from '@/lib/guide/meta';

type U = { user: { id: string }; edit: boolean };
const libOf = (gs: Guide[]) => Object.fromEntries(gs.filter((g) => !isJourney(g)).map((g) => [g.slug, { slug: g.slug, title: g.title, audience: g.audience, sections: g.sections, status: g.status }]));

/** mode: 'journey' = hành trình đầu tiên (không có thì ra Thư viện); 'library'; hoặc slug của 1 hành trình */
export async function renderGuides(u: U, mode: 'journey' | 'library' | { slug: string }) {
  const { guides, error } = await loadLibrary(u.edit);
  const journeys = guides.filter(isJourney);
  const j = typeof mode === 'object' ? journeys.find((x) => x.slug === mode.slug) : mode === 'journey' ? journeys[0] : undefined;
  if (j) {
    const full = { ...j, files: j.files || [] };
    return <JourneyView guide={full} lib={libOf(guides)} canEdit={u.edit} userId={u.user.id} />;
  }
  return <GuideHome guides={guides.filter((g) => !isJourney(g))} canEdit={u.edit} error={error} journeySlug={journeys[0]?.slug || null} />;
}
