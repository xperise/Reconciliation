// Dựng các trang của tab Hướng dẫn (server): Tổng quan · Hành trình · Theo vai trò · Sự cố
import GuideHome from '@/components/guide/GuideHome';
import HubView from '@/components/guide/HubView';
import JourneyView from '@/components/guide/JourneyView';
import SuCoView from '@/components/guide/SuCoView';
import { findJourneySlug, isJourney, loadLibrary } from '@/lib/guide/server';
import type { Guide } from '@/lib/guide/meta';

type U = { user: { id: string }; edit: boolean };
export type Mode = 'hub' | 'library' | 'suco' | { slug: string; edit?: boolean };

export async function renderGuides(u: U, mode: Mode) {
  const { guides, error } = await loadLibrary(u.edit);
  const journeys = guides.filter(isJourney);
  const libG = guides.filter((g) => !isJourney(g));
  const lib = Object.fromEntries(libG.map((g) => [g.slug, g]));
  const j = typeof mode === 'object' ? journeys.find((x) => x.slug === mode.slug) : journeys[0];
  if (j && typeof mode === 'object') return <JourneyView guide={{ ...j, files: j.files || [] }} lib={lib} canEdit={u.edit} userId={u.user.id} startEdit={mode.edit} />;
  if (j && mode === 'hub') return <HubView journey={j} lib={lib} canEdit={u.edit} />;
  if (j && mode === 'suco') {
    const m = libG.flatMap((g) => g.sections).find((s) => s.id === 'ov-matrix') || libG.flatMap((g) => g.sections).find((s) => /tra cứu lỗi|sự cố/i.test(s.title));
    if (m) return <SuCoView md={m.md} journeySlug={j.slug} journey={j.extras!.journey!} />;
  }
  return <GuideHome guides={libG as Guide[]} canEdit={u.edit} error={error} journeySlug={journeys[0]?.slug || null} />;
}
export const journeySlugOf = (withDrafts: boolean) => findJourneySlug(withDrafts);
