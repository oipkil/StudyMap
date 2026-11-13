import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { Tag } from 'antd';
import { Coffee, Moon, Plug, VolumeX, Wifi } from 'lucide-react';
import { MapLibreView, PlaceMapItem } from '../../components/map/MapLibreView';
import { StudyOmnibox } from '../../components/search/StudyOmnibox';

export const MapPage: React.FC = () => {
  const [places, setPlaces] = useState<PlaceMapItem[]>([]);
  const [search, setSearch] = useState('');
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [bounds, setBounds] = useState<[number, number, number, number] | null>(null);
  const [activeFilter, setActiveFilter] = useState<string | null>(null);

  const fetchPlaces = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (search) params.append('q', search);
      if (bounds) params.append('bounds', bounds.join(','));

      const res = await axios.get(`/api/v1/places?${params.toString()}`);
      if (res.data.success && res.data.data) {
        const mapped: (PlaceMapItem & { is24h?: boolean; amenities?: any })[] = res.data.data.map((p: any) => ({
          placeId: p.placeId || p.id,
          name: p.name,
          slug: p.slug,
          categoryId: p.categoryId,
          latitude: p.latitude || p.snapshot?.latitude || 10.762622,
          longitude: p.longitude || p.snapshot?.longitude || 106.682331,
          priceMin: p.priceMin,
          priceMax: p.priceMax,
          ratingOverall: p.ratingOverall,
          reviewCount: p.reviewCount,
          openStatus: p.openStatus,
          coverPhoto: p.coverPhoto,
          address: p.address || p.snapshot?.address,
          is24h: p.is24h || p.snapshot?.weeklySchedule?.some((s: any) => s.is24h),
          amenities: p.snapshot?.amenities || {},
        }));
        setPlaces(mapped);
      }
    } catch (err) {
      console.error('Lỗi nạp danh sách quán trên bản đồ:', err);
    }
  }, [search, bounds]);

  useEffect(() => {
    fetchPlaces();
  }, [fetchPlaces]);

  const filteredPlaces = useMemo(() => {
    return places.filter((p: any) => {
      if (activeFilter === '24h' && !p.is24h) return false;
      if (activeFilter === 'socket' && !['MANY', 'EVERY_TABLE'].includes(p.amenities?.socketDensity)) return false;
      if (activeFilter === 'quiet' && !['QUIET', 'SILENT'].includes(p.amenities?.noiseLevel)) return false;
      if (activeFilter === 'wifi' && !['STRONG', 'MODERATE'].includes(p.amenities?.wifiQuality)) return false;
      return true;
    });
  }, [places, activeFilter]);

  return (
    <div style={{ position: 'relative', width: '100%', height: 'calc(100vh - 64px)', overflow: 'hidden' }}>
      {/* Floating Search Bar on Top of Map */}
      <div
        style={{
          position: 'absolute',
          top: 16,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 20,
          width: '90%',
          maxWidth: 560,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <StudyOmnibox
            value={search}
            onChange={(q) => setSearch(q)}
            placeholder="Tìm quán quanh trường ĐH, khu vực, tên quán..."
          />
        </div>
        <Tag icon={<Coffee size={14} />} style={{ borderRadius: 10, margin: 0, height: 40, display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.96)', color: '#6F4E37', border: '1px solid #EAE3D9', boxShadow: '0 2px 10px rgba(74,46,24,0.08)', fontWeight: 600 }}>
          {filteredPlaces.length} điểm
        </Tag>
      </div>

      {/* Floating Study Filter Chips */}
      <div
        style={{
          position: 'absolute',
          top: 68,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 20,
          width: '90%',
          maxWidth: 560,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          overflowX: 'auto',
          paddingBottom: 4,
          scrollbarWidth: 'none',
        }}
      >
        {[
          { key: 'all', icon: null, label: 'Tất cả' },
          { key: '24h', icon: <Moon size={13} />, label: 'Cú đêm 24/7' },
          { key: 'socket', icon: <Plug size={13} />, label: 'Nhiều ổ cắm' },
          { key: 'quiet', icon: <VolumeX size={13} />, label: 'Rất yên tĩnh' },
          { key: 'wifi', icon: <Wifi size={13} />, label: 'Wi-Fi mạnh' },
        ].map((item) => {
          const isActive = (item.key === 'all' && !activeFilter) || activeFilter === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setActiveFilter(item.key === 'all' ? null : (activeFilter === item.key ? null : item.key))}
              style={{
                background: isActive ? '#4A2E18' : 'rgba(255, 255, 255, 0.94)',
                color: isActive ? '#FFFFFF' : '#4A2E18',
                border: '1px solid ' + (isActive ? '#4A2E18' : '#EAE3D9'),
                backdropFilter: 'blur(8px)',
                borderRadius: 16,
                padding: '4px 12px',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                boxShadow: '0 2px 8px rgba(74, 46, 24, 0.08)',
                transition: 'all 0.15s ease',
              }}
            >
              {item.icon}
              {item.label}
            </button>
          );
        })}
      </div>

      {/* MapLibre Interactive Map */}
      <div style={{ width: '100%', height: '100%' }}>
        <MapLibreView
          places={filteredPlaces}
          selectedPlaceId={selectedPlaceId}
          onSelectPlace={(p) => setSelectedPlaceId(p ? p.placeId : null)}
          onBoundsChange={(b) => setBounds(b)}
          height="100%"
        />
      </div>
    </div>
  );
};
export default MapPage;
