/**
 * 루트 사진 올리기 (브라우저). 루트 빌더의 사진 칸(components/routes/PhotoField.astro)이 쓴다.
 * 1) 사진을 그림으로 읽어(휴대폰 사진의 회전 정보 반영) 긴 변 2000px 이하로 줄인다
 * 2) 캔버스로 다시 저장해 EXIF(위치 정보·기기 정보)를 모두 지운다 — WebP, 안 되는 브라우저는 JPEG
 * 3) Storage 'route-photos/<내 id>/<무작위 uuid>.webp' 에 올린다 (RLS: 승인된 지기, 자기 폴더만)
 */
import { getSupabaseBrowserClient } from '../lib/supabase-browser';
import { PHOTO_BUCKET, PHOTO_INPUT_MAX_BYTES, PHOTO_MAX_BYTES, PHOTO_MAX_EDGE } from '../lib/routePhotos';

export class PhotoError extends Error {}

/** 이보다 작으면 큰 화면에서 흐리게 보인다는 안내만 한다 */
export const PHOTO_SOFT_MIN_EDGE = 1200;

const toBlob = (canvas: HTMLCanvasElement, type: string, quality: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));

async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    // createImageBitmap이 못 읽는 형식(일부 브라우저의 HEIC 등)은 <img>로 한 번 더 시도한다
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } catch {
      throw new PhotoError('이 사진 형식은 읽을 수 없어요. JPG나 PNG로 올려 주세요.');
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

/** 줄이고 EXIF를 지운 사진 */
export async function shrinkPhoto(file: File): Promise<{ blob: Blob; ext: 'webp' | 'jpg'; width: number; height: number; small: boolean }> {
  if (!file.type.startsWith('image/') && !/\.(heic|heif)$/i.test(file.name)) throw new PhotoError('사진 파일만 올릴 수 있어요.');
  if (file.size > PHOTO_INPUT_MAX_BYTES) throw new PhotoError('사진이 너무 커요. 25MB보다 작은 사진을 골라 주세요.');
  const src = await decode(file);
  const w0 = 'naturalWidth' in src ? src.naturalWidth : src.width;
  const h0 = 'naturalHeight' in src ? src.naturalHeight : src.height;
  if (!w0 || !h0) throw new PhotoError('사진을 읽지 못했어요. 다른 사진으로 해 주세요.');

  for (const [edge, quality] of [[PHOTO_MAX_EDGE, 0.82], [1600, 0.75], [1280, 0.7]] as const) {
    const scale = Math.min(1, edge / Math.max(w0, h0));
    const width = Math.round(w0 * scale);
    const height = Math.round(h0 * scale);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new PhotoError('이 브라우저에서는 사진을 줄일 수 없어요.');
    ctx.drawImage(src, 0, 0, width, height);
    let blob = await toBlob(canvas, 'image/webp', quality);
    let ext: 'webp' | 'jpg' = 'webp';
    if (!blob || blob.type !== 'image/webp') {
      blob = await toBlob(canvas, 'image/jpeg', quality + 0.03);
      ext = 'jpg';
    }
    if (blob && blob.size <= PHOTO_MAX_BYTES) {
      if ('close' in src) src.close();
      return { blob, ext, width, height, small: Math.max(w0, h0) < PHOTO_SOFT_MIN_EDGE };
    }
  }
  throw new PhotoError('사진을 3MB 아래로 줄이지 못했어요. 다른 사진으로 해 주세요.');
}

/** 올리고 Storage 경로를 돌려준다 */
export async function uploadPhoto(ownerId: string, blob: Blob, ext: 'webp' | 'jpg'): Promise<string> {
  const path = `${ownerId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await getSupabaseBrowserClient().storage.from(PHOTO_BUCKET).upload(path, blob, {
    contentType: ext === 'webp' ? 'image/webp' : 'image/jpeg',
    cacheControl: '31536000',
    upsert: false,
  });
  if (error) {
    console.error('[YEONON] photo upload failed:', error.message);
    throw new PhotoError('사진을 올리지 못했어요. 잠시 뒤 다시 시도해 주세요.');
  }
  return path;
}

/** 이번에 올렸지만 저장 전에 바꾸거나 뺀 사진 지우기 (실패해도 무시 — 루트에는 붙지 않은 파일) */
export async function deletePhoto(path: string) {
  try {
    await getSupabaseBrowserClient().storage.from(PHOTO_BUCKET).remove([path]);
  } catch {
    /* 무시 */
  }
}
