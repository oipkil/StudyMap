import React from 'react';
import { Image } from 'antd';

export interface GridPhoto {
  assetId?: string;
  url: string;
  fullUrl?: string;
  alt?: string;
}

interface PhotoGridProps {
  photos: GridPhoto[];
  /** Số ô tối đa hiển thị trước khi gộp thành "+N mục khác" (feed: 4, collage: 4). */
  maxShown?: number;
  /** Chiều cao tối đa cho ảnh đơn (feed). */
  singleMaxHeight?: number;
  /**
   * feed: lưới 2 cột (thẻ đánh giá / bài viết, điện thoại).
   * collage: ảnh lớn bên trái + cột ảnh nhỏ bên phải, cao cố định — cho khung rộng (gallery quán trên desktop).
   */
  variant?: 'feed' | 'collage';
  /** Chiều cao khung collage (px). */
  height?: number;
  style?: React.CSSProperties;
  gap?: number;
  rounded?: number;
}

/**
 * Lưới ảnh kiểu mạng xã hội, dùng ở mọi chỗ HIỂN THỊ ảnh (không dùng trong form).
 * feed: 1 ảnh to; 2 cạnh nhau; 3 = 1 trên rộng + 2 dưới; 4+ = 2×2, ô cuối phủ "+N mục khác".
 * collage: 1 ảnh to; 2 = chia đôi; 3 = trái lớn + 2 phải; 4+ = trái lớn + 3 phải (ô cuối "+N mục khác").
 * Bấm vào ảnh nào cũng mở trình xem toàn bộ (kể cả ảnh bị gộp).
 */
export const PhotoGrid: React.FC<PhotoGridProps> = ({ photos, maxShown, singleMaxHeight = 420, variant = 'feed', height = 480, style, gap = 6, rounded = 12 }) => {
  if (!photos || photos.length === 0) return null;
  const maxLimit = variant === 'collage' ? 5 : 4;
  const effectiveMaxShown = maxShown !== undefined ? maxShown : maxLimit;
  const shown = photos.slice(0, Math.max(1, Math.min(effectiveMaxShown, maxLimit)));
  const extra = photos.length - shown.length;
  const n = shown.length;
  const items = photos.map((p) => p.fullUrl || p.url);

  const cell = (p: GridPhoto, i: number, extraStyle?: React.CSSProperties, showMore?: boolean) => (
    <div
      key={(p.assetId || p.url) + i}
      style={{
        position: 'relative',
        background: '#EEECE7',
        overflow: 'hidden',
        minHeight: 0,
        cursor: 'pointer',
        ...extraStyle,
      }}
      className="photo-grid-cell group"
    >
      <div style={{ width: '100%', height: '100%', overflow: 'hidden' }}>
        <Image
          src={p.url}
          preview={{ src: p.fullUrl || p.url }}
          alt={p.alt || ''}
          width="100%"
          height="100%"
          style={{
            objectFit: 'cover',
            display: 'block',
            transition: 'transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), filter 0.3s ease',
          }}
          styles={{ root: { width: '100%', height: '100%' } }}
        />
      </div>
      {showMore && extra > 0 && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(0,0,0,0.52)',
            backdropFilter: 'blur(3px)',
            color: '#fff',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 20,
            fontWeight: 700,
            pointerEvents: 'none',
            gap: 4,
          }}
          aria-hidden
        >
          <span>+{extra} ảnh</span>
          <span style={{ fontSize: 13, fontWeight: 500, opacity: 0.9 }}>Xem tất cả</span>
        </div>
      )}
    </div>
  );

  let body: React.ReactNode;
  if (variant === 'collage') {
    if (n === 1) {
      body = <div style={{ height }}>{cell(shown[0], 0, { height: '100%' })}</div>;
    } else if (n === 2) {
      body = (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap, height }}>
          {shown.map((p, i) => cell(p, i))}
        </div>
      );
    } else if (n === 3) {
      body = (
        <div style={{ display: 'grid', gridTemplateColumns: '1.25fr 1fr', gridTemplateRows: '1fr 1fr', gap, height }}>
          {cell(shown[0], 0, { gridRow: '1 / -1' })}
          {cell(shown[1], 1)}
          {cell(shown[2], 2)}
        </div>
      );
    } else if (n === 4) {
      body = (
        <div style={{ display: 'grid', gridTemplateColumns: '1.25fr 1fr 1fr', gridTemplateRows: '1fr 1fr', gap, height }}>
          {cell(shown[0], 0, { gridColumn: '1 / 2', gridRow: '1 / 3' })}
          {cell(shown[1], 1, { gridColumn: '2 / 4', gridRow: '1 / 2' })}
          {cell(shown[2], 2, { gridColumn: '2 / 3', gridRow: '2 / 3' })}
          {cell(shown[3], 3, { gridColumn: '3 / 4', gridRow: '2 / 3' })}
        </div>
      );
    } else {
      // 5 photos Airbnb Bento layout
      body = (
        <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr 1fr', gridTemplateRows: '1fr 1fr', gap, height }}>
          {cell(shown[0], 0, { gridColumn: '1 / 2', gridRow: '1 / 3' })}
          {cell(shown[1], 1, { gridColumn: '2 / 3', gridRow: '1 / 2' })}
          {cell(shown[2], 2, { gridColumn: '3 / 4', gridRow: '1 / 2' })}
          {cell(shown[3], 3, { gridColumn: '2 / 3', gridRow: '2 / 3' })}
          {cell(shown[4], 4, { gridColumn: '3 / 4', gridRow: '2 / 3' }, true)}
        </div>
      );
    }
  } else if (n === 1) {
    body = <div style={{ display: 'grid', gridTemplateColumns: '1fr' }}>{cell(shown[0], 0, { aspectRatio: '16 / 10', maxHeight: singleMaxHeight })}</div>;
  } else if (n === 2) {
    body = (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap }}>
        {shown.map((p, i) => cell(p, i, { aspectRatio: '1 / 1' }))}
      </div>
    );
  } else if (n === 3) {
    body = (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap }}>
        {cell(shown[0], 0, { gridColumn: '1 / -1', aspectRatio: '16 / 9' })}
        {cell(shown[1], 1, { aspectRatio: '1 / 1' })}
        {cell(shown[2], 2, { aspectRatio: '1 / 1' })}
      </div>
    );
  } else {
    body = (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap }}>
        {shown.map((p, i) => cell(p, i, { aspectRatio: '1 / 1' }, i === shown.length - 1))}
      </div>
    );
  }

  return (
    <Image.PreviewGroup items={items}>
      <div style={{ borderRadius: rounded, overflow: 'hidden', ...style }} data-testid="photo-grid-fb">
        {body}
      </div>
    </Image.PreviewGroup>
  );
};

export default PhotoGrid;
