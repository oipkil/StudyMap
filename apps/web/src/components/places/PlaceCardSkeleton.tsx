import React from 'react';
import { Card, Grid } from 'antd';

const { useBreakpoint } = Grid;

export const PlaceCardSkeleton: React.FC = () => {
  const screens = useBreakpoint();
  const isMobile = screens.xs || (screens.sm && !screens.md);

  return (
    <Card
      style={{
        borderRadius: 14,
        border: '1px solid #EAE3D9',
        background: '#FFFFFF',
        overflow: 'hidden',
        boxShadow: '0 2px 6px rgba(74, 46, 24, 0.03)',
      }}
      styles={{
        body: {
          padding: 12,
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          gap: 14,
        },
      }}
    >
      <style>{`
        @keyframes studySkeletonShimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        .study-shimmer {
          background: linear-gradient(90deg, #F5EFEB 25%, #EFE7DE 50%, #F5EFEB 75%);
          background-size: 200% 100%;
          animation: studySkeletonShimmer 1.5s infinite ease-in-out;
        }
      `}</style>

      {/* Image Skeleton */}
      <div
        className="study-shimmer"
        style={{
          width: isMobile ? '100%' : 140,
          height: isMobile ? 160 : 115,
          borderRadius: 10,
          flexShrink: 0,
        }}
      />

      {/* Content Skeleton */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: isMobile ? 100 : 115 }}>
        <div>
          {/* Title & Rating */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div className="study-shimmer" style={{ width: '55%', height: 18, borderRadius: 6 }} />
            <div className="study-shimmer" style={{ width: 48, height: 18, borderRadius: 6 }} />
          </div>

          {/* Address */}
          <div className="study-shimmer" style={{ width: '80%', height: 12, borderRadius: 4, marginBottom: 6 }} />
          <div className="study-shimmer" style={{ width: '40%', height: 12, borderRadius: 4 }} />
        </div>

        {/* Tags Row */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
          <div className="study-shimmer" style={{ width: 110, height: 22, borderRadius: 6 }} />
          <div className="study-shimmer" style={{ width: 75, height: 22, borderRadius: 6 }} />
          <div className="study-shimmer" style={{ width: 85, height: 22, borderRadius: 6 }} />
        </div>
      </div>
    </Card>
  );
};

export default PlaceCardSkeleton;
