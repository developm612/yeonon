/** 지기 신청 상태 이름·설명 (지기 화면과 관리자 화면이 같이 쓴다) */
export const APPLICATION_STATUS = {
  submitted: { label: '접수됨', desc: '신청서를 받았어요. 검토 후 인터뷰 일정을 연락드릴게요.' },
  interview: { label: '인터뷰', desc: '인터뷰 단계예요. 안내드린 일정을 확인해 주세요.' },
  approved: { label: '승인', desc: '지기로 승인되었어요! 내 루트에서 나만의 루트를 만들어 보세요.' },
  on_hold: { label: '보류', desc: '지금은 심사를 잠시 보류했어요. 필요하면 따로 연락드릴게요.' },
  rejected: { label: '반려', desc: '이번에는 함께하기 어려워요. 신청해 주셔서 감사합니다.' },
} as const;

export type ApplicationStatus = keyof typeof APPLICATION_STATUS;
export const APPLICATION_STATUSES = Object.keys(APPLICATION_STATUS) as ApplicationStatus[];
