import React, { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Button, Space, Card, Typography, Tag, Modal, Tooltip, Divider } from 'antd';
import { PlaceSearchInput } from './PlaceSearchInput';
import { useNavigate } from 'react-router-dom';
import { Crosshair, MapPin, Compass, Maximize2, Star, Coffee, Clock } from 'lucide-react';
import { getDetailedOpenStatus } from '../../utils/openStatus';

const { Text } = Typography;

export interface PlaceMapItem {
  placeId: string;
  name: string;
  slug: string;
  categoryId?: string;
  latitude: number;
  longitude: number;
  priceMin?: number;
  priceMax?: number;
  ratingOverall?: number;
  reviewCount?: number;
  openStatus?: { isOpen: boolean };
  coverPhoto?: any;
  address?: string;
}

interface MapLibreViewProps {
  places: PlaceMapItem[];
  selectedPlaceId?: string | null;
  onSelectPlace?: (place: PlaceMapItem | null) => void;
  onBoundsChange?: (bounds: [number, number, number, number]) => void;
  height?: string | number;
}

interface CampusOption {
  id: string;
  name: string;
  universityName?: string;
  latitude: number;
  longitude: number;
}

interface MarkerEntry {
  marker: maplibregl.Marker;
  el: HTMLElement;
  inner: HTMLElement;
  isSelected: boolean;
}

export const MapLibreView: React.FC<MapLibreViewProps> = ({
  places,
  selectedPlaceId,
  onSelectPlace,
  onBoundsChange,
  height = '100%',
}) => {
  const navigate = useNavigate();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<{ [id: string]: MarkerEntry }>({});
  const [activePlace, setActivePlace] = useState<PlaceMapItem | null>(null);
  const [manualPickerOpen, setManualPickerOpen] = useState<boolean>(false);
  // Cơ sở trường lấy từ DB (admin quản lý ở "Cơ sở trường & danh mục"), không cài cứng
  const [campusOptions, setCampusOptions] = useState<CampusOption[]>([]);
  useEffect(() => {
    if (!manualPickerOpen || campusOptions.length) return;
    fetch('/api/v1/places/meta')
      .then((r) => r.json())
      .then((j) => setCampusOptions(j?.data?.campuses || []))
      .catch(() => setCampusOptions([]));
  }, [manualPickerOpen, campusOptions.length]);
  // Chấm xanh "vị trí của tôi" trên bản đồ (kèm vòng tròn sai số GPS)
  const userMarkerRef = useRef<maplibregl.Marker | null>(null);
  const [userPosition, setUserPosition] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const boundsTimerRef = useRef<any>(null);
  const isProgrammaticMoveRef = useRef<boolean>(false);
  const hasInitialFittedRef = useRef<boolean>(false);

  // Khởi tạo bản đồ MapLibre với OpenFreeMap (Hoàn toàn miễn phí, Vector sắc nét, không bị Watermark API key)
  useEffect(() => {
    if (!mapContainerRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: 'https://tiles.openfreemap.org/styles/bright',
      center: [106.682331, 10.762622], // HCMUS Q5
      zoom: 14,
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');

    // Nhãn chủ quyền biển đảo Việt Nam: quần đảo Hoàng Sa, Trường Sa và Biển Đông.
    // Dữ liệu nền OSM không hiện các nhãn này ở mức thu nhỏ nên vẽ lớp nhãn riêng, luôn hiển thị.
    map.on('load', () => {
      if (map.getSource('vn-islands')) return;
      // Ẩn nhãn 'South China Sea' của lớp nền (đã thay bằng nhãn 'Biển Đông' bên dưới)
      for (const layerId of ['water_name_point_label', 'water_name_line_label']) {
        if (!map.getLayer(layerId)) continue;
        const existing = map.getFilter(layerId) as any;
        const notSCS: any = ['!', ['in', 'South China Sea', ['coalesce', ['get', 'name:en'], ['get', 'name:latin'], ['get', 'name'], '']]];
        map.setFilter(layerId, existing ? ['all', existing, notSCS] : notSCS);
      }
      map.addSource('vn-islands', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: [
            { type: 'Feature', properties: { name: 'Quần đảo Hoàng Sa (Việt Nam)', kind: 'island' }, geometry: { type: 'Point', coordinates: [112.0, 16.5] } },
            { type: 'Feature', properties: { name: 'Quần đảo Trường Sa (Việt Nam)', kind: 'island' }, geometry: { type: 'Point', coordinates: [114.0, 9.5] } },
            { type: 'Feature', properties: { name: 'Biển Đông', kind: 'sea' }, geometry: { type: 'Point', coordinates: [113.5, 13.5] } },
          ],
        },
      });
      map.addLayer({
        id: 'vn-islands-label',
        type: 'symbol',
        source: 'vn-islands',
        minzoom: 2,
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Noto Sans Bold'],
          'text-size': ['case', ['==', ['get', 'kind'], 'sea'], 15, 12],
          'text-letter-spacing': ['case', ['==', ['get', 'kind'], 'sea'], 0.2, 0.05],
          'text-allow-overlap': true,
          'text-ignore-placement': true,
        },
        paint: {
          'text-color': ['case', ['==', ['get', 'kind'], 'sea'], '#2C5F8A', '#B03A2E'],
          'text-halo-color': '#FFFFFF',
          'text-halo-width': 1.5,
        },
      });
    });

    map.on('moveend', () => {
      // Luôn báo khung nhìn mới (kể cả sau flyTo/fitBounds) để danh sách quán không bị 'kẹt' ở lần tải cũ.
      // Vòng lặp fit->fetch->fit đã được chặn bằng hasInitialFittedRef / lastFlownToRef.
      isProgrammaticMoveRef.current = false;

      if (boundsTimerRef.current) clearTimeout(boundsTimerRef.current);
      boundsTimerRef.current = setTimeout(() => {
        const bounds = map.getBounds();
        if (onBoundsChange) {
          onBoundsChange([bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()]);
        }
      }, 500);
    });

    mapRef.current = map;
    // Móc gỡ lỗi cho kịch bản kiểm thử (chỉ môi trường dev)
    if ((import.meta as any).env?.DEV) (window as any).__ssgMap = map;

    return () => {
      Object.values(markersRef.current).forEach((entry) => entry.marker.remove());
      markersRef.current = {};
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Cập nhật Markers dạng Ảnh Tròn (Circular Photo Markers gốc) với diffing chống giật khi zoom
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const currentPlaceIds = new Set(places.map((p) => p.placeId));

    // 1. Dọn sạch các marker không còn trong danh sách khung nhìn
    Object.keys(markersRef.current).forEach((id) => {
      if (!currentPlaceIds.has(id)) {
        markersRef.current[id].marker.remove();
        delete markersRef.current[id];
      }
    });

    // 2. Cập nhật marker hiện có hoặc tạo mới (Không xóa tạo lại, tránh nhấp nháy icon khi zoom in/out)
    places.forEach((place) => {
      if (!place.latitude || !place.longitude) return;

      const isSelected = place.placeId === selectedPlaceId;
      const existing = markersRef.current[place.placeId];

      if (existing) {
        // Cập nhật tọa độ nếu có
        existing.marker.setLngLat([place.longitude, place.latitude]);
        // Cập nhật trạng thái được chọn (selected) trực tiếp trên DOM mà KHÔNG cần reload ảnh
        if (existing.isSelected !== isSelected) {
          existing.isSelected = isSelected;
          existing.el.style.zIndex = isSelected ? '999' : '10';
          existing.inner.style.border = isSelected ? '3.5px solid #C67D34' : '2.5px solid #FFFFFF';
          existing.inner.style.boxShadow = isSelected
            ? '0 0 0 4px rgba(198, 125, 52, 0.45), 0 6px 18px rgba(74, 46, 24, 0.45)'
            : '0 3px 10px rgba(74, 46, 24, 0.28)';
          existing.inner.style.transform = isSelected ? 'scale(1.18)' : 'scale(1)';
        }
        return;
      }

      const photoUrl =
        place.coverPhoto?.publicUrl ||
        place.coverPhoto?.thumbUrl ||
        place.coverPhoto?.url ||
        (place.coverPhoto?.assetId ? `/api/v1/media/${place.coverPhoto.assetId}?variant=thumb` : '');

      // Root element neo GPS ổn định tâm điểm (anchor: center)
      // BẮT BUỘC: position absolute, top 0, left 0, margin 0, transition none để MapLibre tính ma trận chuẩn xác khi zoom
      const el = document.createElement('div');
      el.className = 'ssg-marker-anchor';
      el.style.position = 'absolute';
      el.style.top = '0';
      el.style.left = '0';
      el.style.margin = '0';
      el.style.padding = '0';
      el.style.width = '42px';
      el.style.height = '42px';
      el.style.boxSizing = 'border-box';
      el.style.cursor = 'pointer';
      el.style.transition = 'none';
      el.style.userSelect = 'none';
      el.style.webkitUserSelect = 'none';
      el.style.pointerEvents = 'auto';
      el.style.zIndex = isSelected ? '999' : '10';

      // Khung tròn ảnh đại diện quán (Circular Photo Badge)
      const inner = document.createElement('div');
      inner.className = 'ssg-marker-badge';
      inner.style.width = '100%';
      inner.style.height = '100%';
      inner.style.borderRadius = '50%';
      inner.style.boxSizing = 'border-box';
      inner.style.transformOrigin = 'center center';
      inner.style.border = isSelected ? '3.5px solid #C67D34' : '2.5px solid #FFFFFF';
      inner.style.boxShadow = isSelected
        ? '0 0 0 4px rgba(198, 125, 52, 0.45), 0 6px 18px rgba(74, 46, 24, 0.45)'
        : '0 3px 10px rgba(74, 46, 24, 0.28)';
      inner.style.overflow = 'hidden';
      inner.style.backgroundColor = '#4A2E18';
      inner.style.display = 'flex';
      inner.style.alignItems = 'center';
      inner.style.justifyContent = 'center';
      inner.style.pointerEvents = 'none';
      inner.style.transition = 'transform 0.18s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.18s ease';
      if (isSelected) {
        inner.style.transform = 'scale(1.18)';
      }

      if (photoUrl) {
        inner.innerHTML = `
          <img
            src="${photoUrl}"
            alt="${place.name}"
            loading="lazy"
            draggable="false"
            style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%; pointer-events: none; display: block;"
            onerror="this.onerror=null; this.parentElement.innerHTML='<span style=\\'color:#FFFFFF;font-size:16px;\\'>☕</span>';"
          />
        `;
      } else {
        inner.innerHTML = `<span style="color: #FFFFFF; font-size: 16px; pointer-events: none;">☕</span>`;
      }

      el.appendChild(inner);

      el.addEventListener('mouseenter', () => {
        inner.style.transform = isSelected ? 'scale(1.24)' : 'scale(1.14)';
        inner.style.boxShadow = '0 6px 18px rgba(74, 46, 24, 0.45)';
        el.style.zIndex = '1000';
      });
      el.addEventListener('mouseleave', () => {
        inner.style.transform = isSelected ? 'scale(1.18)' : 'scale(1)';
        inner.style.boxShadow = isSelected
          ? '0 0 0 4px rgba(198, 125, 52, 0.45), 0 6px 18px rgba(74, 46, 24, 0.45)'
          : '0 3px 10px rgba(74, 46, 24, 0.28)';
        el.style.zIndex = isSelected ? '999' : '10';
      });

      el.addEventListener('click', () => {
        setActivePlace(place);
        if (onSelectPlace) onSelectPlace(place);
      });

      const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat([place.longitude, place.latitude])
        .addTo(map);

      markersRef.current[place.placeId] = {
        marker,
        el,
        inner,
        isSelected,
      };
    });

    // Chỉ auto-fit bounds 1 LẦN DUY NHẤT khi load lần đầu và có places
    if (!hasInitialFittedRef.current && places.length > 0) {
      hasInitialFittedRef.current = true;
      if (places.length >= 2) {
        const bounds = new maplibregl.LngLatBounds();
        places.forEach((p) => {
          if (p.longitude && p.latitude) bounds.extend([p.longitude, p.latitude]);
        });
        isProgrammaticMoveRef.current = true;
        map.fitBounds(bounds, { padding: 60, maxZoom: 16 });
      } else if (places.length === 1 && places[0].longitude && places[0].latitude) {
        isProgrammaticMoveRef.current = true;
        map.flyTo({ center: [places[0].longitude, places[0].latitude], zoom: 15 });
      }
    }
  }, [places, selectedPlaceId]);

  // Nhảy tới quán khi có quán được chọn từ bên trái
  // Chỉ bay tới quán khi NGƯỜI DÙNG đổi lựa chọn. Không bay lại mỗi lần danh sách quán được tải lại
  // (kéo/thu phóng bản đồ -> fetch lại places -> trước đây bị kéo ngược về quán đang chọn).
  const lastFlownToRef = useRef<string | null>(null);
  useEffect(() => {
    if (!mapRef.current) return;
    if (!selectedPlaceId) {
      lastFlownToRef.current = null;
      return;
    }
    if (lastFlownToRef.current === selectedPlaceId) return;
    const place = places.find((p) => p.placeId === selectedPlaceId);
    if (place && place.longitude && place.latitude) {
      lastFlownToRef.current = selectedPlaceId;
      setActivePlace(place);
      isProgrammaticMoveRef.current = true;
      mapRef.current.flyTo({
        center: [place.longitude, place.latitude],
        zoom: 16,
        essential: true,
      });
    }
  }, [selectedPlaceId, places]);

  /** Chấm xanh vị trí hiện tại + vòng tròn sai số, luôn hiện trên bản đồ sau khi định vị. */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !userPosition) return;

    if (!userMarkerRef.current) {
      const el = document.createElement('div');
      el.setAttribute('data-testid', 'user-location-dot');
      el.style.cssText = 'width:18px;height:18px;border-radius:50%;background:#2563eb;border:3px solid #fff;box-shadow:0 0 0 2px rgba(37,99,235,0.35), 0 2px 6px rgba(0,0,0,0.3);';
      userMarkerRef.current = new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([userPosition.lng, userPosition.lat]).addTo(map);
    } else {
      userMarkerRef.current.setLngLat([userPosition.lng, userPosition.lat]);
    }

    // Vòng tròn sai số GPS (mét) vẽ bằng layer circle theo tỉ lệ zoom
    const data: any = {
      type: 'FeatureCollection',
      features: [{ type: 'Feature', properties: { accuracy: userPosition.accuracy }, geometry: { type: 'Point', coordinates: [userPosition.lng, userPosition.lat] } }],
    };
    const draw = () => {
      const src = map.getSource('user-accuracy') as any;
      if (src) {
        src.setData(data);
        return;
      }
      map.addSource('user-accuracy', { type: 'geojson', data });
      map.addLayer({
        id: 'user-accuracy-circle',
        type: 'circle',
        source: 'user-accuracy',
        paint: {
          'circle-color': '#2563eb',
          'circle-opacity': 0.12,
          'circle-stroke-color': '#2563eb',
          'circle-stroke-opacity': 0.35,
          'circle-stroke-width': 1,
          'circle-radius': ['interpolate', ['exponential', 2], ['zoom'], 10, 4, 20, 90],
        },
      });
    };
    if (map.isStyleLoaded()) draw();
    else map.once('load', draw);
  }, [userPosition]);

  // Xử lý nút "Vị trí của tôi": bay tới vị trí thật và cắm chấm xanh
  const handleLocateMe = () => {
    if (!navigator.geolocation) {
      setManualPickerOpen(true);
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        setUserPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy || 0 });
        if (mapRef.current) {
          isProgrammaticMoveRef.current = true;
          mapRef.current.flyTo({
            center: [pos.coords.longitude, pos.coords.latitude],
            zoom: 15,
            essential: true,
          });
        }
      },
      () => {
        setLocating(false);
        // Khi người dùng từ chối hoặc lỗi GPS -> mở modal chọn vị trí trường thủ công
        setManualPickerOpen(true);
      },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  };

  const handleToggleFullscreen = () => {
    if (!mapContainerRef.current) return;
    if (!document.fullscreenElement) {
      mapContainerRef.current.requestFullscreen().catch(console.error);
    } else {
      document.exitFullscreen().catch(console.error);
    }
  };

  return (
    <div style={{ position: 'relative', width: '100%', height, minHeight: 450, overflow: 'hidden' }}>
      <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />

      {/* Floating Bottom Left Buttons: Fullscreen & "Where am I?" Pill */}
      <div
        style={{
          position: 'absolute',
          bottom: 20,
          left: 20,
          zIndex: 10,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <Tooltip title="Toàn màn hình bản đồ">
          <button
            onClick={handleToggleFullscreen}
            style={{
              width: 42,
              height: 42,
              borderRadius: '50%',
              background: '#ffffff',
              border: 'none',
              boxShadow: '0 2px 10px rgba(0,0,0,0.18)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: '#374151',
              transition: 'transform 0.15s',
            }}
            onMouseDown={(e) => (e.currentTarget.style.transform = 'scale(0.95)')}
            onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
          >
            <Maximize2 size={19} color="#374151" />
          </button>
        </Tooltip>

        <button
          onClick={handleLocateMe}
          style={{
            height: 42,
            padding: '0 16px',
            borderRadius: 24,
            background: '#ffffff',
            border: 'none',
            boxShadow: '0 2px 10px rgba(0,0,0,0.18)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: 14,
            color: '#1f2937',
            transition: 'transform 0.15s, box-shadow 0.15s',
          }}
          onMouseDown={(e) => (e.currentTarget.style.transform = 'scale(0.97)')}
          onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
        >
          <div
            style={{
              width: 26,
              height: 26,
              borderRadius: '50%',
              background: '#2563eb',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Crosshair size={15} color="#ffffff" />
          </div>
          <span>{locating ? 'Đang định vị…' : userPosition ? 'Về vị trí của tôi' : 'Vị trí của tôi'}</span>
        </button>
      </div>

      {/* Thẻ nhỏ: toạ độ hiện tại của người dùng (hiện sau khi bấm "Vị trí của tôi") */}
      {userPosition && (
        <div
          data-testid="user-location-card"
          style={{
            position: 'absolute',
            top: 12,
            left: 12,
            zIndex: 12,
            background: 'rgba(255,255,255,0.96)',
            borderRadius: 10,
            padding: '6px 10px',
            boxShadow: '0 2px 10px rgba(0,0,0,0.16)',
            fontSize: 12,
            color: '#1F2421',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#2563eb', display: 'inline-block' }} />
          <span>
            Bạn đang ở {userPosition.lat.toFixed(5)}, {userPosition.lng.toFixed(5)}
            {userPosition.accuracy ? ` (±${Math.round(userPosition.accuracy)} m)` : ''}
          </span>
          <button
            onClick={() => setUserPosition(null)}
            style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#6F6B66', fontSize: 14, lineHeight: 1 }}
            aria-label="Ẩn vị trí của tôi"
          >
            ×
          </button>
        </div>
      )}

      {/* Popup chi tiết quán khi click marker */}
      {activePlace && (
        <div
          style={{
            position: 'absolute',
            bottom: 74,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 25,
            width: '90%',
            maxWidth: 360,
          }}
        >
          <Card
            size="small"
            style={{
              borderRadius: 14,
              background: '#FFFFFF',
              border: '1px solid #EAE3D9',
              boxShadow: '0 12px 32px rgba(74, 46, 24, 0.14)',
            }}
            extra={
              <button
                onClick={() => setActivePlace(null)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#7A6C60',
                  cursor: 'pointer',
                  fontSize: 16,
                  padding: 4,
                }}
              >
                ✕
              </button>
            }
            title={
              <Text strong style={{ color: '#4A2E18', fontSize: 15, display: 'inline-flex', alignItems: 'center', gap: 6 }} ellipsis>
                <Coffee size={15} color="#6F4E37" /> {activePlace.name}
              </Text>
            }
          >
            <Space direction="vertical" style={{ width: '100%' }} size={6}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                {(activePlace.ratingOverall ?? 0) > 0 ? (
                  <Space size={4}>
                    <Star size={15} color="#C67D34" fill="#C67D34" />
                    <Text strong style={{ color: '#C67D34', fontSize: 14 }}>
                      {Number(activePlace.ratingOverall).toFixed(1)}
                    </Text>
                    <Text style={{ color: '#7A6C60', fontSize: 12 }}>({activePlace.reviewCount || 0})</Text>
                  </Space>
                ) : (
                  <Text style={{ color: '#7A6C60', fontSize: 12 }}>Chưa có đánh giá</Text>
                )}

                {(() => {
                  const openInfo = getDetailedOpenStatus(activePlace);
                  return (
                    <Tag
                      icon={<Clock size={11} />}
                      style={{
                        fontSize: 11,
                        background: openInfo.bg,
                        color: openInfo.color,
                        border: `1px solid ${openInfo.border}`,
                        borderRadius: 6,
                        fontWeight: 600,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      {openInfo.text}
                    </Tag>
                  );
                })()}
              </div>

              <Text style={{ color: '#7A6C60', fontSize: 12 }} ellipsis>
                {activePlace.address || 'Chưa có địa chỉ'}
              </Text>

              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <Button
                  type="primary"
                  size="small"
                  block
                  style={{ borderRadius: 8, background: '#6F4E37', fontWeight: 600 }}
                  onClick={() => navigate(`/places/${activePlace.slug}`)}
                >
                  Xem chi tiết quán
                </Button>
                <Button
                  size="small"
                  icon={<Compass size={14} color="#4A2E18" />}
                  href={`https://www.google.com/maps/dir/?api=1&destination=${activePlace.latitude},${activePlace.longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ borderRadius: 8, borderColor: '#EAE3D9', color: '#4A2E18' }}
                >
                  Chỉ đường
                </Button>
              </div>
            </Space>
          </Card>
        </div>
      )}

      {/* Modal chọn vị trí trường khi không có GPS */}
      <Modal
        title={
          <Space>
            <MapPin size={20} color="#6F4E37" />
            <span>Chọn Cơ Sở Trường Đại Học Quanh Bạn</span>
          </Space>
        }
        open={manualPickerOpen}
        onCancel={() => setManualPickerOpen(false)}
        footer={null}
        destroyOnHidden
      >
        <p style={{ color: '#6F6B66', fontSize: 13, marginBottom: 12 }}>
          Trình duyệt không nhận được vị trí GPS. Tìm khu vực bạn đang ở, hoặc chọn trường / KTX bên dưới để đưa bản đồ tới đó.
        </p>

        <PlaceSearchInput
          autoFocus
          searchIcon
          placeholder="Tìm khu vực: tên đường, phường, quận, quán… (vd: Nguyễn Văn Cừ, Làng Đại Học)"
          onPick={(hit) => {
            if (mapRef.current) {
              isProgrammaticMoveRef.current = true;
              mapRef.current.flyTo({ center: [hit.longitude, hit.latitude], zoom: 15, essential: true });
            }
            setManualPickerOpen(false);
          }}
        />
        <Button
          block
          style={{ marginTop: 8 }}
          icon={<Crosshair size={14} />}
          onClick={() => {
            setManualPickerOpen(false);
            handleLocateMe();
          }}
        >
          Thử lại vị trí hiện tại (GPS)
        </Button>

        <Divider style={{ margin: '14px 0 10px' }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            hoặc chọn trường / KTX
          </Text>
        </Divider>

        <Space orientation="vertical" style={{ width: '100%' }} size="small">
          {campusOptions.length === 0 && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              Chưa có cơ sở trường nào — quản trị viên thêm tại "Cơ sở trường & danh mục".
            </Text>
          )}
          {campusOptions.map((campus) => (
            <Button
              key={campus.id}
              block
              style={{ textAlign: 'left', height: 'auto', padding: '10px 14px', borderRadius: 8 }}
              onClick={() => {
                if (mapRef.current) {
                  isProgrammaticMoveRef.current = true;
                  mapRef.current.flyTo({ center: [campus.longitude, campus.latitude], zoom: 15, essential: true });
                }
                setManualPickerOpen(false);
              }}
            >
              <Space>
                <MapPin size={16} color="#2F6B4F" />
                <span style={{ textAlign: 'left' }}>
                  <Text strong>{campus.name}</Text>
                  {campus.universityName && (
                    <Text type="secondary" style={{ fontSize: 12, marginLeft: 6 }}>
                      {campus.universityName}
                    </Text>
                  )}
                </span>
              </Space>
            </Button>
          ))}
        </Space>
      </Modal>
    </div>
  );
};

export default MapLibreView;
