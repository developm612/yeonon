/**
 * 화면에서 GA4 이벤트 보내기. 태그(components/Analytics.astro)는 운영 주소에서만 window.gtag를 만들므로
 * 로컬·미리보기 주소에서는 아무것도 하지 않는다. 개인 식별 정보는 보내지 않는다.
 */
type Gtag = (command: 'event', name: string, params?: Record<string, string | number | boolean>) => void;

export function track(name: string, params: Record<string, string | number | boolean> = {}) {
  const gtag = (window as unknown as { gtag?: Gtag }).gtag;
  if (typeof gtag === 'function') gtag('event', name, params);
}
