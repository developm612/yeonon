/**
 * 브라우저 실시간 구독 도우미 (Preact 아일랜드 전용 — 서버에서 부르지 않는다).
 * Supabase Realtime(postgres_changes)은 구독자의 로그인 토큰으로 테이블 RLS를 확인한 뒤에만 변경을 보낸다.
 * 연결이 끊기거나 실패하면 주기적으로 다시 읽는다(폴링). 탭으로 돌아올 때도 한 번 다시 읽는다.
 */
import type { RealtimePostgresChangesPayload, SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseBrowserClient } from './supabase-browser';

const POLL_MS = 30_000;

export interface LiveOptions<T extends Record<string, unknown>> {
  /** 채널 이름 (페이지 안에서 겹치지 않게) */
  channel: string;
  table: 'bookings' | 'notifications';
  /** 예: 'user_id=eq.<uuid>' */
  filter: string;
  onChange: (payload: RealtimePostgresChangesPayload<T>) => void;
  /** 다시 읽기 (처음 연결, 연결 실패 시 폴링, 탭 복귀) */
  reload: (sb: SupabaseClient) => void | Promise<void>;
}

/** 구독을 시작하고, 정리 함수를 돌려준다 (useEffect에서 그대로 return) */
export function subscribeLive<T extends Record<string, unknown>>(opts: LiveOptions<T>): () => void {
  let sb: SupabaseClient;
  try {
    sb = getSupabaseBrowserClient();
  } catch {
    return () => {};
  }
  let timer: ReturnType<typeof setInterval> | undefined;
  let stopped = false;
  const poll = (on: boolean) => {
    if (on && !timer) timer = setInterval(() => void opts.reload(sb), POLL_MS);
    if (!on && timer) {
      clearInterval(timer);
      timer = undefined;
    }
  };
  const onVisible = () => document.visibilityState === 'visible' && void opts.reload(sb);
  document.addEventListener('visibilitychange', onVisible);

  const channel = sb.channel(opts.channel);
  void (async () => {
    // 쿠키에 있는 세션 토큰으로 Realtime에 로그인한다 (RLS가 이 토큰 기준으로 적용된다)
    const { data } = await sb.auth.getSession();
    if (stopped) return;
    if (data.session) sb.realtime.setAuth(data.session.access_token);
    // 연결을 기다리지 않고 먼저 한 번 읽는다 (Realtime이 막혀 있어도 바로 보이게)
    void opts.reload(sb);
    let wasDown = false;
    channel
      .on<T>('postgres_changes', { event: '*', schema: 'public', table: opts.table, filter: opts.filter }, (payload) => opts.onChange(payload))
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          poll(false);
          // 끊겼다 다시 붙었으면 그사이 놓친 변경을 다시 읽는다
          if (wasDown) void opts.reload(sb);
          wasDown = false;
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          wasDown = true;
          poll(true);
        }
      });
  })();

  return () => {
    stopped = true;
    poll(false);
    document.removeEventListener('visibilitychange', onVisible);
    void sb.removeChannel(channel);
  };
}

export { getSupabaseBrowserClient };
