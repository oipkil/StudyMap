/** Tải một ảnh (File/Blob) lên media gateway; trả về bản ghi Asset (đã xử lý xong ở dev, có thể PROCESSING ở prod). */
export interface UploadedAsset {
  id: string;
  originalName: string;
  mimeType: string;
  byteSize: number;
  width: number;
  height: number;
  isAnimated: boolean;
  frameCount: number;
  technicalStatus: string;
  moderationStatus: string;
  currentRevisionId?: string | null;
  currentRevision?: { id: string } | null;
}

export async function uploadImage(file: Blob, filename: string): Promise<UploadedAsset> {
  const formData = new FormData();
  formData.append('file', file, filename);
  const csrf = document.cookie.match(/ssg_csrf=([^;]+)/)?.[1] ?? '';
  const res = await fetch('/api/v1/media/upload', {
    method: 'POST',
    headers: { 'x-csrf-token': csrf },
    credentials: 'include',
    body: formData,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) throw new Error(data.message || 'Không tải được ảnh lên');
  return data.data as UploadedAsset;
}

/** Đường dẫn xem ảnh của chính người tải (preview=true: thấy cả ảnh chưa được duyệt). */
export const previewUrl = (assetId: string, variant: 'thumb' | 'optimized' = 'thumb') =>
  `/api/v1/media/${assetId}?variant=${variant}&preview=true`;

export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/** Kiểm tra nhanh trước khi cắt/tải: đúng định dạng và dưới 10MB. Trả về thông báo lỗi hoặc null. */
export function validateImageFile(file: File): string | null {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) return `"${file.name}": chỉ nhận ảnh JPG, PNG, GIF hoặc WebP`;
  if (file.size > MAX_IMAGE_BYTES) return `"${file.name}": ảnh vượt quá 10MB`;
  return null;
}
