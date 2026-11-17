/**
 * 정류장 종류 (여행자 화면의 선 아이콘). 정류장 첫 취향 태그로 정한다 — DB에는 저장하지 않는다.
 * 이모지 대신 이 종류의 아이콘(components/Icon.astro)을 쓴다 (yeonon-traveler-ui-plan.md 3-5).
 */
import type { InterestId } from './interests';

export type StopKind = 'cafe' | 'shop' | 'food' | 'walk' | 'workshop' | 'photo' | 'night';

export const STOP_KINDS: Record<StopKind, { label: string; icon: 'coffee' | 'bag' | 'utensils' | 'walk' | 'craft' | 'camera' | 'moon' }> = {
  cafe: { label: 'Café', icon: 'coffee' },
  shop: { label: 'Shopping', icon: 'bag' },
  food: { label: 'Food', icon: 'utensils' },
  walk: { label: 'Walk', icon: 'walk' },
  workshop: { label: 'Workshop', icon: 'craft' },
  photo: { label: 'Photo spot', icon: 'camera' },
  night: { label: 'Night out', icon: 'moon' },
};

const BY_TAG: Record<InterestId, StopKind> = {
  cafe: 'cafe',
  bakery: 'cafe',
  popup: 'shop',
  fashion: 'shop',
  beauty: 'shop',
  vintage: 'shop',
  design: 'shop',
  market: 'shop',
  'korean-food': 'food',
  'street-food': 'food',
  vegan: 'food',
  healing: 'walk',
  river: 'walk',
  tradition: 'walk',
  workshop: 'workshop',
  art: 'workshop',
  photo: 'photo',
  kpop: 'photo',
  'night-view': 'night',
  bar: 'night',
};

/** 정류장 종류: 첫 취향 태그 기준, 없으면 산책 */
export const stopKind = (tags: readonly string[]): StopKind => BY_TAG[tags[0] as InterestId] ?? 'walk';
