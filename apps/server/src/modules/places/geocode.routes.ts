import { Router, Request, Response, NextFunction } from 'express';

/**
 * Proxy tìm địa điểm (geocoding) qua Photon/Komoot — nhà cung cấp bản đồ mở đang dùng (không cần API key).
 * Dùng cho ô "Tên quán" trong form thêm quán / gợi ý quán: gõ tên -> chọn đúng địa điểm -> tự điền địa chỉ + toạ độ.
 * Mặc định khoanh vùng TP.HCM (bbox) và ưu tiên gần KHTN để kết quả sát với sinh viên.
 */
const router = Router();
const ENDPOINT = (process.env.GEOCODING_ENDPOINT || 'https://photon.komoot.io/api').replace(/\/$/, '');
const HCMC_BBOX = '106.35,10.35,107.05,11.20';
const HCMUS = { lat: 10.762622, lon: 106.682331 };

// Cache ngắn hạn trong bộ nhớ để không gọi lặp khi gõ (Photon là dịch vụ công cộng, cần lịch sự)
const cache = new Map<string, { at: number; data: unknown }>();
const TTL_MS = 5 * 60 * 1000;

export interface GeocodeHit {
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  kind: string | null; // amenity/cafe, shop/..., street, house...
  osmId: string;
}

function toHit(f: any): GeocodeHit | null {
  const p = f?.properties || {};
  const [lon, lat] = f?.geometry?.coordinates || [];
  if (typeof lat !== 'number' || typeof lon !== 'number') return null;
  const street = [p.housenumber, p.street].filter(Boolean).join(' ');
  const address = [street, p.locality, p.district, p.city].filter(Boolean).join(', ');
  return {
    name: p.name || street || p.city || 'Không tên',
    address: address || [p.county, p.state, p.country].filter(Boolean).join(', '),
    latitude: lat,
    longitude: lon,
    kind: p.osm_key ? `${p.osm_key}/${p.osm_value}` : null,
    osmId: `${p.osm_type || ''}${p.osm_id || ''}`,
  };
}

async function fetchJson(url: string) {
  const r = await fetch(url, { headers: { 'User-Agent': 'SSG-StudyMap/1.0 (studymap.online)' }, signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`Geocoder ${r.status}`);
  return r.json();
}

// GET /api/v1/places/geocode?q=...&wide=1   (wide=1: không giới hạn TP.HCM)
router.get('/geocode', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = String(req.query.q || '').trim();
    const wide = req.query.wide === '1';
    if (q.length < 2) return res.json({ success: true, data: [] });
    const key = `s:${wide}:${q.toLowerCase()}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < TTL_MS) return res.json({ success: true, data: hit.data });

    const params = new URLSearchParams({ q, limit: '8', lat: String(HCMUS.lat), lon: String(HCMUS.lon) });
    if (!wide) params.set('bbox', HCMC_BBOX);
    const json: any = await fetchJson(`${ENDPOINT}/?${params.toString()}`);
    const data = ((json.features || []) as any[]).map(toHit).filter((x): x is GeocodeHit => Boolean(x));
    cache.set(key, { at: Date.now(), data });
    return res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/places/geocode/reverse?lat=..&lng=..  -> địa chỉ gần nhất cho toạ độ dán từ Google Maps
router.get('/geocode/reverse', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(422).json({ success: false, errorCode: 'VALIDATION_ERROR', message: 'Toạ độ không hợp lệ' });
    }
    const key = `r:${lat.toFixed(5)},${lng.toFixed(5)}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < TTL_MS) return res.json({ success: true, data: hit.data });
    const base = ENDPOINT.replace(/\/api$/, '');
    const json: any = await fetchJson(`${base}/reverse?lat=${lat}&lon=${lng}`);
    const data = toHit((json.features || [])[0]);
    cache.set(key, { at: Date.now(), data });
    return res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

export default router;
