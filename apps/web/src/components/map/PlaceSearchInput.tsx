import React, { useEffect, useRef, useState } from 'react';
import { AutoComplete, Input, Typography, Spin } from 'antd';
import axios from 'axios';
import { MapPin, Search } from 'lucide-react';

const { Text } = Typography;

export interface GeoHit {
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  kind: string | null;
  osmId: string;
}

interface Props {
  value?: string;
  onChange?: (text: string) => void;
  /** Người dùng chọn một địa điểm từ bản đồ (OpenStreetMap qua Photon) */
  onPick: (hit: GeoHit) => void;
  placeholder?: string;
  /** Không giới hạn TP.HCM */
  wide?: boolean;
  size?: 'small' | 'middle' | 'large';
  allowClear?: boolean;
  autoFocus?: boolean;
  style?: React.CSSProperties;
  /** Hiện icon kính lúp thay vì ghim */
  searchIcon?: boolean;
  /** id do antd Form.Item truyền vào để label/validate trỏ đúng ô nhập */
  id?: string;
}

/** Phân tích chuỗi dán vào: "10.76, 106.68" hoặc link Google Maps (…@10.76,106.68,17z / !3d10.76!4d106.68 / ?q=10.76,106.68) */
export function parseCoordinates(text: string): { latitude: number; longitude: number } | null {
  const t = text.trim();
  const patterns = [
    /@(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/, // ...maps/place/.../@10.76,106.68,17z
    /!3d(-?\d{1,2}\.\d+)!4d(-?\d{1,3}\.\d+)/, // ...!3d10.76!4d106.68
    /[?&](?:q|query|ll|destination)=(-?\d{1,2}\.\d+),\s*(-?\d{1,3}\.\d+)/, // ?q=10.76,106.68
    /^\s*(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)\s*$/, // "10.76, 106.68"
  ];
  for (const re of patterns) {
    const m = t.match(re);
    if (m) {
      const lat = Number(m[1]);
      const lng = Number(m[2]);
      if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return { latitude: lat, longitude: lng };
    }
  }
  return null;
}

/**
 * Ô tìm địa điểm kiểu Google Maps: gõ tên quán / đường / khu vực -> chọn kết quả -> trả về tên, địa chỉ, toạ độ.
 * Dán toạ độ hoặc link Google Maps cũng được (tự đọc lat/lng rồi tra địa chỉ ngược).
 */
export const PlaceSearchInput: React.FC<Props> = ({
  value,
  onChange,
  onPick,
  placeholder = 'Gõ tên quán, đường, khu vực… hoặc dán link Google Maps',
  wide = false,
  size = 'middle',
  allowClear = true,
  autoFocus,
  style,
  searchIcon,
  id,
}) => {
  const [text, setText] = useState(value || '');
  const [options, setOptions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const timer = useRef<number | null>(null);
  const lastQuery = useRef('');

  useEffect(() => {
    if (value !== undefined && value !== text) setText(value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const search = (q: string) => {
    if (timer.current) window.clearTimeout(timer.current);
    if (q.trim().length < 2) {
      setOptions([]);
      return;
    }
    timer.current = window.setTimeout(async () => {
      lastQuery.current = q;
      setLoading(true);
      try {
        const res = await axios.get('/api/v1/places/geocode', { params: { q, wide: wide ? 1 : undefined } });
        if (lastQuery.current !== q) return;
        const hits: GeoHit[] = res.data?.data || [];
        setOptions(
          hits.map((h, i) => ({
            value: `${h.osmId || i}::${h.name}`,
            hit: h,
            label: (
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '2px 0' }}>
                <MapPin size="1em" style={{ color: '#2F6B4F', marginTop: 3 }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.name}</div>
                  <Text type="secondary" style={{ fontSize: 12, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {h.address || 'Không có địa chỉ'}
                  </Text>
                </div>
              </div>
            ),
          })),
        );
      } catch {
        setOptions([]);
      } finally {
        setLoading(false);
      }
    }, 350);
  };

  const handleChange = async (v: string) => {
    setText(v);
    onChange?.(v);
    const coords = parseCoordinates(v);
    if (coords) {
      // Dán toạ độ / link Google Maps -> tra địa chỉ gần nhất
      setLoading(true);
      try {
        const res = await axios.get('/api/v1/places/geocode/reverse', { params: { lat: coords.latitude, lng: coords.longitude } });
        const near: GeoHit | null = res.data?.data || null;
        onPick({
          name: near?.name || '',
          address: near?.address || '',
          latitude: coords.latitude,
          longitude: coords.longitude,
          kind: near?.kind || null,
          osmId: near?.osmId || '',
        });
      } catch {
        onPick({ name: '', address: '', latitude: coords.latitude, longitude: coords.longitude, kind: null, osmId: '' });
      } finally {
        setLoading(false);
        setOptions([]);
      }
      return;
    }
    search(v);
  };

  return (
    <AutoComplete
      value={text}
      options={options}
      onChange={handleChange}
      onSelect={(_v, opt: any) => {
        const hit: GeoHit = opt.hit;
        setText(hit.name);
        onChange?.(hit.name);
        onPick(hit);
        setOptions([]);
      }}
      style={{ width: '100%', ...style }}
      notFoundContent={loading ? <Spin size="small" /> : text.trim().length >= 2 ? 'Không tìm thấy — thử tên đường hoặc phường' : null}
    >
      <Input
        id={id}
        size={size}
        allowClear={allowClear}
        autoFocus={autoFocus}
        placeholder={placeholder}
        prefix={searchIcon ? <Search size="1em" style={{ color: '#9A958E' }} /> : <MapPin size="1em" style={{ color: '#9A958E' }} />}
        suffix={loading ? <Spin size="small" /> : undefined}
      />
    </AutoComplete>
  );
};

export default PlaceSearchInput;
