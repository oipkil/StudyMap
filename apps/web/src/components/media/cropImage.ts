/** Vùng cắt theo pixel trên ảnh gốc (react-easy-crop trả về qua onCropComplete). */
export interface PixelCrop {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Không đọc được ảnh'));
    img.src = src;
  });
}

const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Kích thước khung chứa ảnh sau khi xoay (để không bị cắt góc). */
function rotatedSize(width: number, height: number, rotation: number) {
  const r = toRad(rotation);
  return {
    width: Math.abs(Math.cos(r) * width) + Math.abs(Math.sin(r) * height),
    height: Math.abs(Math.sin(r) * width) + Math.abs(Math.cos(r) * height),
  };
}

/**
 * Cắt (và xoay) ảnh ngay trên trình duyệt bằng canvas -> Blob để tải lên.
 * Ảnh xuất ra tối đa `maxSize` px cạnh dài (ảnh điện thoại 4000px sẽ được thu nhỏ -> upload nhanh, server đỡ việc).
 * Không dùng cho GIF động (sẽ mất chuyển động) — với GIF, gọi API crop phía server.
 */
export async function getCroppedBlob(
  src: string,
  crop: PixelCrop,
  rotation = 0,
  mime: 'image/jpeg' | 'image/png' | 'image/webp' = 'image/jpeg',
  maxSize = 2000,
): Promise<Blob> {
  const image = await loadImage(src);
  const { width: bW, height: bH } = rotatedSize(image.width, image.height, rotation);

  // 1. Vẽ ảnh đã xoay lên canvas "an toàn"
  const safe = document.createElement('canvas');
  safe.width = Math.round(bW);
  safe.height = Math.round(bH);
  const sctx = safe.getContext('2d');
  if (!sctx) throw new Error('Trình duyệt không hỗ trợ canvas');
  sctx.translate(bW / 2, bH / 2);
  sctx.rotate(toRad(rotation));
  sctx.translate(-image.width / 2, -image.height / 2);
  sctx.drawImage(image, 0, 0);

  // 2. Cắt vùng đã chọn, thu nhỏ nếu quá lớn
  const scale = Math.min(1, maxSize / Math.max(crop.width, crop.height));
  const out = document.createElement('canvas');
  out.width = Math.max(1, Math.round(crop.width * scale));
  out.height = Math.max(1, Math.round(crop.height * scale));
  const octx = out.getContext('2d');
  if (!octx) throw new Error('Trình duyệt không hỗ trợ canvas');
  if (mime === 'image/jpeg') {
    octx.fillStyle = '#ffffff';
    octx.fillRect(0, 0, out.width, out.height);
  }
  octx.drawImage(safe, crop.x, crop.y, crop.width, crop.height, 0, 0, out.width, out.height);

  return new Promise((resolve, reject) => {
    out.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Không tạo được ảnh đã cắt'))), mime, 0.92);
  });
}

/** Chọn định dạng đầu ra giữ được đặc tính ảnh gốc (PNG trong suốt giữ PNG, còn lại JPEG cho nhẹ). */
export function outputMimeFor(file: File | Blob): 'image/jpeg' | 'image/png' | 'image/webp' {
  if (file.type === 'image/png') return 'image/png';
  if (file.type === 'image/webp') return 'image/webp';
  return 'image/jpeg';
}

export const isAnimatedGif = (file: File | Blob) => file.type === 'image/gif';
