/**
 * AI 루트 추천 설정 (계획서 2-3, 7장). 값을 바꿀 곳은 여기 한 곳이다.
 * 가중치는 /admin/recommendations의 클릭·요청 전환율을 보며 조정한다.
 * API 키·모델 이름은 환경 변수(.env.example)로 둔다: LLM_API_KEY, LLM_MODEL, EMBEDDING_API_KEY, EMBEDDING_MODEL
 */
export const RECOMMEND = {
  /** match_routes 점수 = (tag × 태그 겹침 + similarity × 임베딩 유사도 + quality × 품질) / 가중치 합 */
  weights: { tag: 0.45, similarity: 0.4, quality: 0.15 },
  /**
   * 코사인 유사도를 0~1 점수로 펴는 구간. 문장 임베딩은 관련 없는 글끼리도 0.2 안팎이 나오므로
   * floor 이하는 0점, ceil 이상은 만점으로 본다. 모델을 바꾸면 실제 값 분포를 보고 다시 맞춘다.
   */
  similarityRange: { floor: 0.2, ceil: 0.75 },
  /**
   * 품질 점수 (0~1) — 지기 지표(jigi_profiles, 마이그레이션 17번이 후기·응답 때마다 갱신)로 계산한다.
   * 데이터가 충분한 항목만 weights 비율로 평균 내고, 하나도 없으면 default.
   *   rating: 후기 minReviews개 이상이면 평점/5
   *   accept: 응답한 요청(수락·거절·기한 만료) minRequests개 이상이면 수락률
   *   speed:  같은 조건에서 평균 응답 시간 fastMinutes 이하 1점 → slowMinutes 이상 0점
   */
  quality: {
    default: 0.5,
    minReviews: 3,
    minRequests: 3,
    weights: { rating: 0.6, accept: 0.25, speed: 0.15 },
    fastMinutes: 60,
    slowMinutes: 720,
  },

  /** DB에서 받는 후보 수(LLM에 보내는 수)와 최종 추천 수 */
  candidateCount: 10,
  finalCount: 5,
  /** 결과 카드에 보여 줄 가능 시간 칩 수 / DB에서 받아 올 최대 수 */
  slotChips: 4,
  slotLimit: 8,

  /** 같은 사람·같은 조건이면 이 시간 동안 저장된 결과를 다시 쓴다 (AI 호출 없음) */
  cacheMinutes: 30,
  /** 사람당 시간당 새 추천 횟수 (캐시로 돌려준 결과는 세지 않는다) */
  hourlyLimit: 10,

  /** 시간 제한 (ms). LLM이 이 안에 답하지 않으면 점수 순서 + 템플릿 이유로 바로 보여 준다 */
  llmTimeoutMs: 6000,
  queryEmbeddingTimeoutMs: 2500,
  routeEmbeddingTimeoutMs: 8000,

  /** LLM 호출 옵션. effort는 지원하는 모델에서만 보낸다(null이면 보내지 않음) */
  llm: { maxTokens: 2000, effort: 'low' as 'low' | 'medium' | 'high' | null },

  /**
   * 템플릿(대체) 결과의 Perfect match 기준: 관심사가 min(고른 수, 3)개 이상 루트와 맞고 분위기도 맞을 때.
   * LLM 결과는 LLM이 perfect/close를 정한다.
   */
  perfectTagMatches: 3,
  /** LLM이 perfect라고 해도 점수가 이보다 낮으면 Closest로 둔다 (카드의 일치율 %와 어긋나지 않게) */
  perfectMinScore: 0.6,

  /** 관리자 임베딩 백필 한 번에 처리할 루트 수 (서버 함수 시간 제한 안에 끝나도록) */
  backfillBatch: 40,
} as const;

/** 임베딩 벡터 차원. DB의 routes.embedding vector(1024)와 같아야 한다 (마이그레이션 8번 상단 주석) */
export const EMBEDDING_DIM = 1024;

/** 추천 입력 범위 */
export const DISCOVER = {
  noteMax: 200,
  /** 오늘부터 며칠 뒤까지 고를 수 있나 (슬롯은 앞으로 4주만 만든다) */
  maxDaysAhead: 27,
  defaultDays: 13,
  partyMax: 6,
  languagesMax: 3,
} as const;

export const TIMES_OF_DAY = [
  { id: 'any', label: 'Any time' },
  { id: 'morning', label: 'Morning', hint: 'before 12:00' },
  { id: 'afternoon', label: 'Afternoon', hint: '12:00–17:00' },
  { id: 'evening', label: 'Evening', hint: 'from 17:00' },
] as const;
export type TimeOfDay = (typeof TIMES_OF_DAY)[number]['id'];

export const DISCOVER_VIBES = [
  { id: 'any', label: 'Either is fine' },
  { id: 'slow', label: 'Slow & relaxed' },
  { id: 'active', label: 'Active & packed' },
] as const;
export type DiscoverVibe = (typeof DISCOVER_VIBES)[number]['id'];
