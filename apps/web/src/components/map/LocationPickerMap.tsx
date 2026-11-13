import React, { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Button, Typography, Space, Tooltip, Modal, Grid, message } from 'antd';
import axios from 'axios';
import { PlaceSearchInput, type GeoHit } from './PlaceSearchInput';
import { Crosshair, Maximize2, Minimize2 } from 'lucide-react';

const { Text } = Typography;

export interface LatLng {
  latitude: number;
  longitude: number;
}

export type PickSource = 'search' | 'drag' | 'click' | 'gps';

interface LocationPickerMapProps {
  value?: LatLng | null;
  /** Gọi khi ghim đổi chỗ (kéo ghim, bấm bản đồ, chọn kết quả tìm, GPS). meta có địa chỉ/tên nếu tra được. */
  onChange: (pos: LatLng, meta: { address?: string; name?: string; source: PickSource }) => void;
  height?: number | string;
  /** Hiện ô tìm kiếm phía trên bản đồ. */
  showSearch?: boolean;
  searchPlaceholder?: string;
  /** Tâm mặc định khi chưa có giá trị (TP.HCM). */
  defaultCenter?: LatLng;
  disabled?: boolean;
  /** Cho phép mở bản đồ toàn màn hình để chọn vị trí dễ hơn (mặc định bật). */
  expandable?: boolean;
}

const HCMC: LatLng = { latitude: 10.7769, longitude: 106.7009 };
const round6 = (n: number) => Number(n.toFixed(6));

/**
 * Chọn vị trí trên bản đồ thay cho việc gõ kinh độ/vĩ độ: tìm địa điểm, bấm hoặc kéo ghim, hoặc dùng GPS.
 * Toạ độ được trả về cho form; địa chỉ tra ngược (Photon) hiện bên dưới để người nhập đối chiếu.
 */
export const LocationPickerMap: React.FC<LocationPickerMapProps> = ({
  value,
  onChange,
  height = 260,
  showSearch = true,
  searchPlaceholder = 'Tìm tên quán, đường, khu vực… hoặc dán link Google Maps',
  defaultCenter = HCMC,
  disabled,
  expandable = true,
}) => {
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;
  const [expanded, setExpanded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const [address, setAddress] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [ready, setReady] = useState(false);

  const reverse = async (pos: LatLng): Promise<GeoHit | undefined> => {
    try {
      const res = await axios.get('/api/v1/places/geocode/reverse', { params: { lat: pos.latitude, lng: pos.longitude } });
      const hit: GeoHit | null = res.data?.data ?? null;
      setAddress(hit?.address ?? null);
      return hit ?? undefined;
    } catch {
      setAddress(null);
      return undefined;
    }
  };

  /** Tạo ghim (một lần) hoặc dời ghim tới vị trí mới. */
  const ensureMarker = (pos: LatLng) => {
    const map = mapRef.current;
    if (!map) return;
    if (markerRef.current) {
      markerRef.current.setLngLat([pos.longitude, pos.latitude]);
      return;
    }
    const marker = new maplibregl.Marker({ draggable: !disabled, color: '#2F6B4F' }).setLngLat([pos.longitude, pos.latitude]).addTo(map);
    marker.on('dragend', async () => {
      const ll = marker.getLngLat();
      const p = { latitude: round6(ll.lat), longitude: round6(ll.lng) };
      const hit = await reverse(p);
      onChangeRef.current(p, { address: hit?.address, name: hit?.name, source: 'drag' });
    });
    markerRef.current = marker;
  };

  /** Người dùng chọn vị trí mới (tìm / bấm / GPS). */
  const pick = async (pos: LatLng, source: PickSource, meta?: { address?: string; name?: string }) => {
    const map = mapRef.current;
    if (!map) return;
    ensureMarker(pos);
    if (source !== 'click') map.flyTo({ center: [pos.longitude, pos.latitude], zoom: Math.max(map.getZoom(), 16), duration: 600 });
    if (meta?.address) {
      setAddress(meta.address);
      onChangeRef.current(pos, { ...meta, source });
      return;
    }
    const hit = await reverse(pos);
    onChangeRef.current(pos, { address: hit?.address, name: hit?.name, source });
  };

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const start = value ?? defaultCenter;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: 'https://tiles.openfreemap.org/styles/bright',
      center: [start.longitude, start.latitude],
      zoom: value ? 16 : 12,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    mapRef.current = map;
    // Trong Modal/Drawer, khung có thể chưa có kích thước lúc khởi tạo -> đo lại sau khi hiệu ứng mở kết thúc
    const resizeTimer = setTimeout(() => map.resize(), 350);
    const onWinResize = () => map.resize();
    window.addEventListener('resize', onWinResize);
    // Khung đổi kích thước (modal mở rộng, xoay màn hình) -> vẽ lại toàn bộ khung, không để hở nửa dưới
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => map.resize()) : null;
    if (ro && containerRef.current) ro.observe(containerRef.current);
    map.on('load', () => {
      setReady(true);
      if (value) {
        ensureMarker(value);
        void reverse(value);
      }
    });
    if (!disabled) {
      map.on('click', (e) => void pick({ latitude: round6(e.lngLat.lat), longitude: round6(e.lngLat.lng) }, 'click'));
    }
    return () => {
      clearTimeout(resizeTimer);
      window.removeEventListener('resize', onWinResize);
      ro?.disconnect();
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Giá trị từ form đổi (ví dụ nhập tay toạ độ ở phần nâng cao) -> dời ghim theo
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !value) return;
    const cur = markerRef.current?.getLngLat();
    if (cur && Math.abs(cur.lat - value.latitude) < 1e-7 && Math.abs(cur.lng - value.longitude) < 1e-7) return;
    ensureMarker(value);
    map.easeTo({ center: [value.longitude, value.latitude], zoom: Math.max(map.getZoom(), 15), duration: 400 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value?.latitude, value?.longitude, ready]);

  const locate = () => {
    if (!navigator.geolocation) return message.warning('Trình duyệt không hỗ trợ định vị');
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        void pick({ latitude: round6(pos.coords.latitude), longitude: round6(pos.coords.longitude) }, 'gps');
      },
      () => {
        setLocating(false);
        message.warning('Không lấy được vị trí — hãy tìm địa điểm hoặc bấm lên bản đồ');
      },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  };

  return (
    <div data-testid="location-picker">
      {showSearch && !disabled && (
        <div style={{ marginBottom: 8 }}>
          <PlaceSearchInput placeholder={searchPlaceholder} searchIcon onPick={(hit) => void pick({ latitude: hit.latitude, longitude: hit.longitude }, 'search', { address: hit.address, name: hit.name })} />
        </div>
      )}
      <div style={{ position: 'relative', borderRadius: 10, overflow: 'hidden', border: '1px solid #E8E6E1' }}>
        <div ref={containerRef} style={{ width: '100%', height }} />
        {!disabled && (
          <div style={{ position: 'absolute', left: 8, top: 8, display: 'flex', gap: 6 }}>
            <Tooltip title="Dùng vị trí hiện tại của tôi">
              <Button size="small" icon={<Crosshair size="1em" />} loading={locating} onClick={locate} style={{ background: '#fff' }} data-testid="location-gps">
                Vị trí của tôi
              </Button>
            </Tooltip>
            {expandable && (
              <Tooltip title="Mở bản đồ lớn để chọn chính xác">
                <Button size="small" icon={<Maximize2 size="1em" />} onClick={() => setExpanded(true)} style={{ background: '#fff' }} data-testid="location-expand">
                  {isMobile ? '' : 'Mở rộng'}
                </Button>
              </Tooltip>
            )}
          </div>
        )}
        {!value && !disabled && (
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, background: 'rgba(31,36,33,0.75)', color: '#fff', fontSize: 12, padding: '6px 10px', textAlign: 'center', pointerEvents: 'none' }}>
            Bấm lên bản đồ để đặt ghim, hoặc tìm địa điểm ở ô trên
          </div>
        )}
      </div>
      {expandable && (
        <Modal
          open={expanded}
          onCancel={() => setExpanded(false)}
          footer={null}
          closable={false}
          width={isMobile ? '100vw' : 'min(1200px, 94vw)'}
          style={isMobile ? { top: 0, margin: 0, maxWidth: '100vw', paddingBottom: 0 } : { top: 20 }}
          styles={{ container: { padding: 0, borderRadius: isMobile ? 0 : 12, overflow: 'hidden' }, body: { padding: 0 } }}
          destroyOnHidden
        >
          <div style={{ display: 'flex', flexDirection: 'column', height: isMobile ? '100vh' : 'min(84vh, 900px)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderBottom: '1px solid #E8E6E1', background: '#fff' }}>
              <Text strong style={{ flex: 1, fontSize: 15 }}>
                Chọn vị trí quán trên bản đồ
              </Text>
              <Button type="primary" icon={<Minimize2 size="1em" />} onClick={() => setExpanded(false)} data-testid="location-expand-done">
                Xong
              </Button>
            </div>
            <div style={{ flex: 1, minHeight: 0, padding: isMobile ? 8 : 12, display: 'flex', flexDirection: 'column' }}>
              {/* Bản đồ thứ hai dùng chung value/onChange; đóng lại thì bản đồ nhỏ nhảy theo ghim mới */}
              <LocationPickerMap value={value} onChange={onChange} showSearch searchPlaceholder={searchPlaceholder} defaultCenter={value ?? defaultCenter} disabled={disabled} expandable={false} height={isMobile ? 'calc(100vh - 150px)' : 'calc(min(84vh, 900px) - 150px)'} />
            </div>
          </div>
        </Modal>
      )}
      <Space size={6} wrap style={{ marginTop: 6, width: '100%', justifyContent: 'space-between' }}>
        <Text type="secondary" style={{ fontSize: 12 }}>
          {value ? (address ? `Gần: ${address}` : 'Kéo ghim để chỉnh vị trí chính xác') : 'Chưa có vị trí'}
        </Text>
        {value && (
          <Text type="secondary" style={{ fontSize: 11, fontFamily: 'monospace' }} data-testid="location-coords">
            {value.latitude.toFixed(5)}, {value.longitude.toFixed(5)}
          </Text>
        )}
      </Space>
    </div>
  );
};

export default LocationPickerMap;
