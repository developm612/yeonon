/**
 * 루트 사진 (대표 사진 1장 + 정류장 사진 각 1장). 저장소: Supabase Storage 공개 버킷 'route-photos'.
 * 파일 이름: <지기 user id>/<무작위 uuid>.webp (또는 .jpg). 올리기는 승인된 지기가 자기 폴더에만 (Storage RLS),
 * 루트에 붙이는 것은 save_route 함수가 그 지기 폴더의 실제 파일인지 확인한 뒤에만 된다.
 * 마이그레이션: supabase/migrations/20261116000020_route_photos.sql
 * 브라우저·서버가 같이 쓴다 (서버 전용 코드 import 금지).
 */
export const PHOTO_BUCKET = 'route-photos';

/** DB·폼에 들어가는 사진 경로 모양 (DB 검사와 같다) */
export const PHOTO_PATH = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webp|jpg)$/;

/** 브라우저에서 줄이는 긴 변 길이 (px) */
export const PHOTO_MAX_EDGE = 2000;
/** 줄인 뒤 올릴 수 있는 최대 크기 (버킷 제한과 같다) */
export const PHOTO_MAX_BYTES = 3 * 1024 * 1024;
/** 고를 수 있는 원본 최대 크기 */
export const PHOTO_INPUT_MAX_BYTES = 25 * 1024 * 1024;

/** 폼 값 → 사진 경로 (모양이 틀리면 null) */
export const cleanPhotoPath = (v: string | null | undefined) => {
  const s = (v ?? '').trim();
  return PHOTO_PATH.test(s) ? s : null;
};

/** 공개 주소 (버킷이 공개라 로그인 없이 읽힌다) */
export const photoUrl = (path: string) =>
  `${String(import.meta.env.PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '')}/storage/v1/object/public/${PHOTO_BUCKET}/${path}`;
