import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { Dropdown, Checkbox, message, Empty, Drawer, Segmented, Button, Grid, Tag, Radio, Space } from 'antd';
import { MapLibreView } from '../../components/map/MapLibreView';
import { PlaceContributionModal } from '../../components/places/PlaceContributionModal';
import { StudyOmnibox } from '../../components/search/StudyOmnibox';
import { PlaceCardSkeleton } from '../../components/places/PlaceCardSkeleton';
import { getDetailedOpenStatus } from '../../utils/openStatus';
import { useAuth } from '../../context/AuthContext';
import { motion } from 'framer-motion';
import { Wifi, Zap, VolumeX, Users, Navigation, Compass, Coffee, GraduationCap, Clock, Camera, Star, Filter, LayoutGrid, MapPin, Heart, Scale, Plus, Bike, Plug } from 'lucide-react';

const { useBreakpoint } = Grid;

export const DiscoverPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const screens = useBreakpoint();
  const isMobile = screens.xs || (screens.sm && !screens.md);

  const [places, setPlaces] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>(searchParams.get('q') || '');
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  // Chế độ "bám theo": di chuột lên thẻ quán thì bản đồ bay tới quán đó. Tắt mặc định vì khi bay tới,
  // khung nhìn đổi -> danh sách chỉ còn quán trong khung -> người dùng thấy như "mất quán".
  const [followOnHover, setFollowOnHover] = useState<boolean>(() => {
    try {
      return localStorage.getItem('ssg_follow_on_hover') === '1';
    } catch {
      return false;
    }
  });
  const toggleFollowOnHover = (v: boolean) => {
    setFollowOnHover(v);
    try {
      localStorage.setItem('ssg_follow_on_hover', v ? '1' : '0');
    } catch {
      /* bỏ qua */
    }
  };

  // Mobile View Switch: 'list' or 'map'
  const [mobileView, setMobileView] = useState<'list' | 'map'>('list');
  const [filterDrawerOpen, setFilterDrawerOpen] = useState<boolean>(false);

  // Filter & View states
  const [selectedVibes, setSelectedVibes] = useState<string[]>([]);
  const [selectedAmenities, setSelectedAmenities] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<'rating' | 'priceAsc' | 'priceDesc' | 'distance'>('rating');
  const [showOnlyFavorites, setShowOnlyFavorites] = useState<boolean>(false);
  const [favoritePlaceIds, setFavoritePlaceIds] = useState<string[]>([]);
  const [bounds, setBounds] = useState<[number, number, number, number] | null>(null);

  // User Geolocation & Radius Filter
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [maxDistanceKm, setMaxDistanceKm] = useState<number | null>(null);
  const [locating, setLocating] = useState<boolean>(false);

  // Modals
  const [contribModalOpen, setContribModalOpen] = useState<boolean>(false);

  // Fetch student favorites
  useEffect(() => {
    if (user) {
      axios
        .get('/api/v1/me/favorites')
        .then((res) => {
          if (res.data.success) {
            setFavoritePlaceIds(res.data.data.map((f: any) => f.placeId));
          }
        })
        .catch(console.error);
    }
  }, [user]);

  // Fetch places
  const fetchPlaces = useCallback(
    async (isInitial = false) => {
      if (isInitial) setLoading(true);
      try {
        const params = new URLSearchParams();
        if (searchQuery) params.append('q', searchQuery);
        if (bounds) params.append('bounds', bounds.join(','));

        const res = await axios.get(`/api/v1/places?${params.toString()}`);
        if (res.data.success) {
          setPlaces(res.data.data);
        }
      } catch (err) {
        console.error('Lỗi khi tải danh sách quán:', err);
      } finally {
        if (isInitial) setLoading(false);
      }
    },
    [searchQuery, bounds],
  );

  useEffect(() => {
    fetchPlaces(true);
  }, [searchQuery]);

  useEffect(() => {
    const q = searchParams.get('q');
    if (q !== null && q !== searchQuery) {
      setSearchQuery(q);
    }
  }, [searchParams]);

  useEffect(() => {
    if (bounds) {
      fetchPlaces(false);
    }
  }, [bounds]);

  const handleBoundsChange = useCallback((newBounds: [number, number, number, number]) => {
    setBounds((prev) => {
      if (!prev) return newBounds;
      const diff =
        Math.abs(prev[0] - newBounds[0]) +
        Math.abs(prev[1] - newBounds[1]) +
        Math.abs(prev[2] - newBounds[2]) +
        Math.abs(prev[3] - newBounds[3]);
      if (diff < 0.003) return prev;
      return newBounds;
    });
  }, []);

  const handleToggleFavorite = async (e: React.MouseEvent, placeId: string) => {
    e.stopPropagation();
    if (!user) {
      message.info('Vui lòng đăng nhập để lưu quán yêu thích');
      navigate('/login');
      return;
    }

    const isFav = favoritePlaceIds.includes(placeId);
    setFavoritePlaceIds(isFav ? favoritePlaceIds.filter((id) => id !== placeId) : [...favoritePlaceIds, placeId]);

    try {
      const res = await axios.post(`/api/v1/me/favorites/${placeId}`);
      if (res.data.success) {
        message.success(res.data.isFavorited ? 'Đã lưu quán vào mục yêu thích' : 'Đã bỏ lưu quán');
      }
    } catch {
      setFavoritePlaceIds(favoritePlaceIds);
      message.error('Lỗi khi cập nhật yêu thích');
    }
  };

  // Khoảng cách theo công thức Haversine
  const calculateDistanceKm = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371; // km
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const formatDistanceBadge = (km: number) => {
    if (km < 1) {
      const meters = Math.round(km * 1000);
      const mins = Math.max(1, Math.round(meters / 80));
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <Navigation size={12} /> {meters}m ({mins}p đi bộ)
        </span>
      );
    }
    const mins = Math.max(1, Math.round((km / 30) * 60));
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        <Bike size={12} /> {km.toFixed(1)}km (~{mins}p xe)
      </span>
    );
  };

  const handleToggleRadius = (km: number) => {
    if (maxDistanceKm === km) {
      setMaxDistanceKm(null);
      return;
    }

    if (userLocation) {
      setMaxDistanceKm(km);
      return;
    }

    if (!navigator.geolocation) {
      message.warning('Trình duyệt của bạn không hỗ trợ định vị.');
      return;
    }

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setMaxDistanceKm(km);
        message.success(`Đã xác định vị trí! Lọc các quán trong bán kính ${km}km.`);
      },
      (err) => {
        setLocating(false);
        console.warn('Lỗi định vị:', err);
        message.info('Vui lòng cho phép quyền truy cập vị trí trên trình duyệt để sử dụng tính năng này.');
      },
      { timeout: 10000, enableHighAccuracy: true },
    );
  };

  // Filter & sort
  const filteredPlaces = places
    .map((p) => {
      const lat = p.latitude || p.snapshot?.latitude;
      const lng = p.longitude || p.snapshot?.longitude;
      const dist = userLocation && lat && lng ? calculateDistanceKm(userLocation.lat, userLocation.lng, lat, lng) : null;
      return { ...p, _distanceKm: dist };
    })
    .filter((p) => {
      if (maxDistanceKm !== null) {
        if (p._distanceKm === null || p._distanceKm > maxDistanceKm) return false;
      }
      if (showOnlyFavorites && !favoritePlaceIds.includes(p.placeId)) return false;
      const snap = p.snapshot || {};
      const amen = p.studyAmenities || snap.amenities || {};

      if (selectedAmenities.length > 0) {
        if (selectedAmenities.includes('wifi')) {
          const w = amen.wifiQuality;
          if (!w || w === 'NONE' || w === 'UNKNOWN') return false;
        }
        if (selectedAmenities.includes('socket')) {
          const s = amen.socketDensity;
          if (!s || s === 'NONE' || s === 'UNKNOWN') return false;
        }
        if (selectedAmenities.includes('aircon')) {
          if (amen.airConditioned === false) return false;
        }
        if (selectedAmenities.includes('group')) {
          if (!amen.groupStudyAllowed && (!amen.privateRoomsCount || amen.privateRoomsCount <= 0)) return false;
        }
        if (selectedAmenities.includes('24h') && !p.is24h) return false;
      }

      if (selectedVibes.length > 0) {
        if (selectedVibes.includes('quiet')) {
          const n = amen.noiseLevel;
          if (n !== 'QUIET' && n !== 'SILENT') return false;
        }
        if (selectedVibes.includes('group')) {
          if (!amen.groupStudyAllowed && (!amen.privateRoomsCount || amen.privateRoomsCount <= 0)) return false;
        }
        if (selectedVibes.includes('chill')) {
          const n = amen.noiseLevel;
          if (n === 'LOUD') return false;
        }
      }

      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'distance' && a._distanceKm !== null && b._distanceKm !== null) {
        return a._distanceKm - b._distanceKm;
      }
      if (sortBy === 'rating') return (b.ratingOverall || 0) - (a.ratingOverall || 0);
      if (sortBy === 'priceAsc') return (a.priceMin || 0) - (b.priceMin || 0);
      if (sortBy === 'priceDesc') return (b.priceMin || 0) - (a.priceMin || 0);
      return 0;
    });

  const vibeItems = [
    {
      key: 'quiet',
      label: (
        <Checkbox
          checked={selectedVibes.includes('quiet')}
          onChange={(e) =>
            setSelectedVibes(
              e.target.checked ? [...selectedVibes, 'quiet'] : selectedVibes.filter((v) => v !== 'quiet'),
            )
          }
        >
          Yên tĩnh học bài / làm việc
        </Checkbox>
      ),
    },
    {
      key: 'group',
      label: (
        <Checkbox
          checked={selectedVibes.includes('group')}
          onChange={(e) =>
            setSelectedVibes(
              e.target.checked ? [...selectedVibes, 'group'] : selectedVibes.filter((v) => v !== 'group'),
            )
          }
        >
          Thảo luận & Họp nhóm
        </Checkbox>
      ),
    },
    {
      key: 'chill',
      label: (
        <Checkbox
          checked={selectedVibes.includes('chill')}
          onChange={(e) =>
            setSelectedVibes(
              e.target.checked ? [...selectedVibes, 'chill'] : selectedVibes.filter((v) => v !== 'chill'),
            )
          }
        >
          Chill & View đẹp thư giãn
        </Checkbox>
      ),
    },
  ];

  const amenityItems = [
    {
      key: 'wifi',
      label: (
        <Checkbox
          checked={selectedAmenities.includes('wifi')}
          onChange={(e) =>
            setSelectedAmenities(
              e.target.checked ? [...selectedAmenities, 'wifi'] : selectedAmenities.filter((a) => a !== 'wifi'),
            )
          }
        >
          Wi-Fi Tốc Độ Cao
        </Checkbox>
      ),
    },
    {
      key: 'socket',
      label: (
        <Checkbox
          checked={selectedAmenities.includes('socket')}
          onChange={(e) =>
            setSelectedAmenities(
              e.target.checked ? [...selectedAmenities, 'socket'] : selectedAmenities.filter((a) => a !== 'socket'),
            )
          }
        >
          Nhiều Ổ Cắm Từng Bàn
        </Checkbox>
      ),
    },
    {
      key: 'aircon',
      label: (
        <Checkbox
          checked={selectedAmenities.includes('aircon')}
          onChange={(e) =>
            setSelectedAmenities(
              e.target.checked ? [...selectedAmenities, 'aircon'] : selectedAmenities.filter((a) => a !== 'aircon'),
            )
          }
        >
          Có Máy Lạnh / Điều Hòa
        </Checkbox>
      ),
    },
    {
      key: '24h',
      label: (
        <Checkbox
          checked={selectedAmenities.includes('24h')}
          onChange={(e) =>
            setSelectedAmenities(
              e.target.checked ? [...selectedAmenities, '24h'] : selectedAmenities.filter((a) => a !== '24h'),
            )
          }
        >
          Mở Cửa 24/24 Xuyên Đêm
        </Checkbox>
      ),
    },
  ];

  const sortItems = [
    { key: 'rating', label: <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Star size={14} /> Đánh giá cao nhất</span>, onClick: () => setSortBy('rating') },
    {
      key: 'distance',
      label: <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Navigation size={14} /> Gần tôi nhất</span>,
      onClick: () => {
        if (!userLocation) {
          handleToggleRadius(5);
        }
        setSortBy('distance');
      },
    },
    { key: 'priceAsc', label: <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Coffee size={14} /> Giá thấp đến cao</span>, onClick: () => setSortBy('priceAsc') },
    { key: 'priceDesc', label: <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Coffee size={14} /> Giá cao đến thấp</span>, onClick: () => setSortBy('priceDesc') },
  ];

  const mapPlaces = useMemo(
    () =>
      filteredPlaces.map((p) => ({
        placeId: p.placeId,
        name: p.name,
        slug: p.slug,
        latitude: p.latitude || p.snapshot?.latitude,
        longitude: p.longitude || p.snapshot?.longitude,
        ratingOverall: p.ratingOverall,
        reviewCount: p.reviewCount,
        priceMin: p.priceMin,
        priceMax: p.priceMax,
        coverPhoto: p.coverPhoto,
        address: p.address || p.snapshot?.address,
        openStatus: p.openStatus,
      })),
    [filteredPlaces],
  );

  const filterCount = selectedVibes.length + selectedAmenities.length + (showOnlyFavorites ? 1 : 0);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: '#F7F6F3',
        color: '#1F2421',
        width: '100%',
        overflowX: 'hidden',
      }}
    >
      {/* 1. TOP HEADER */}
      <header
        style={{
          height: isMobile ? 50 : 58,
          background: 'rgba(255, 255, 255, 0.95)',
          backdropFilter: 'blur(16px)',
          borderBottom: '1px solid #EAE3D9',
          padding: isMobile ? '0 12px' : '0 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          zIndex: 30,
          flexShrink: 0,
          width: '100%',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
            <span style={{ fontSize: isMobile ? 14 : 16, fontWeight: 800, color: '#4A2E18' }}>TP.HCM</span>
            <span style={{ color: '#D5C8BA', fontSize: 12 }}>•</span>
            <span style={{ color: '#7A6C60', fontSize: isMobile ? 12 : 13, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <Coffee size={14} color="#6F4E37" /> {filteredPlaces.length} quán học bài
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {isMobile ? (
            <Segmented
              value={mobileView}
              onChange={(val) => setMobileView(val as 'list' | 'map')}
              options={[
                { label: 'Danh sách', value: 'list', icon: <LayoutGrid size="1em" /> },
                { label: 'Bản đồ', value: 'map', icon: <MapPin size="1em" /> },
              ]}
              size="small"
              style={{ background: '#F3EEE7' }}
            />
          ) : (
            <>
              <button
                onClick={() => setShowOnlyFavorites(!showOnlyFavorites)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: showOnlyFavorites ? '#B5484D' : '#5A4C40',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <Heart size={14} fill={showOnlyFavorites ? 'currentColor' : 'none'} /> Yêu thích ({favoritePlaceIds.length})
                </span>
              </button>

              <button
                onClick={() => navigate('/compare')}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#5A4C40',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <Scale size={14} /> So sánh
                </span>
              </button>
            </>
          )}

          <button
            onClick={() => setContribModalOpen(true)}
            style={{
              background: '#6F4E37',
              color: '#ffffff',
              border: 'none',
              borderRadius: 20,
              padding: isMobile ? '4px 10px' : '6px 14px',
              fontSize: isMobile ? 12 : 13,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              boxShadow: '0 2px 6px rgba(111, 78, 55, 0.25)',
            }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <Plus size={14} /> Gợi ý quán
            </span>
          </button>
        </div>
      </header>

      {/* 2. MAIN BODY */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative', width: '100%' }}>
        {/* LIST PANEL (Shown if Desktop OR Mobile in 'list' view) */}
        {(!isMobile || mobileView === 'list') && (
          <div
            style={{
              width: isMobile ? '100%' : '48%',
              minWidth: isMobile ? '100%' : 400,
              maxWidth: isMobile ? '100%' : 620,
              background: '#FAF7F2',
              display: 'flex',
              flexDirection: 'column',
              borderRight: isMobile ? 'none' : '1px solid #EAE3D9',
              overflowY: 'auto',
              height: '100%',
            }}
          >
            {/* Search & Filter Trigger Bar */}
            <div
              style={{
                padding: '12px 14px',
                borderBottom: '1px solid #EAE3D9',
                position: 'sticky',
                top: 0,
                background: '#FAF7F2',
                zIndex: 15,
              }}
            >
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <StudyOmnibox
                    value={searchQuery}
                    onChange={(q) => setSearchQuery(q)}
                    onSelectSuggestion={(q, filterKey) => {
                      setSearchQuery(q);
                      if (filterKey === 'amenity_24h' && !selectedAmenities.includes('24h')) {
                        setSelectedAmenities((prev) => [...prev, '24h']);
                      } else if (filterKey === 'amenity_socket' && !selectedAmenities.includes('socket')) {
                        setSelectedAmenities((prev) => [...prev, 'socket']);
                      } else if (filterKey === 'vibe_quiet' && !selectedVibes.includes('quiet')) {
                        setSelectedVibes((prev) => [...prev, 'quiet']);
                      } else if (filterKey === 'amenity_group' && !selectedAmenities.includes('group')) {
                        setSelectedAmenities((prev) => [...prev, 'group']);
                      }
                    }}
                    placeholder="Tìm quán học bài, tên trường ĐH, khu vực..."
                  />
                </div>

                {isMobile ? (
                  <Button
                    icon={<Filter size="1em" />}
                    onClick={() => setFilterDrawerOpen(true)}
                    style={{
                      background: filterCount > 0 ? '#6F4E37' : '#F3EEE7',
                      borderColor: 'transparent',
                      color: filterCount > 0 ? '#FFFFFF' : '#261C14',
                      borderRadius: 10,
                      height: 40,
                      fontWeight: 600,
                    }}
                  >
                    Lọc {filterCount > 0 && `(${filterCount})`}
                  </Button>
                ) : (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <Dropdown menu={{ items: vibeItems }} trigger={['click']}>
                      <button
                        style={{
                          background: selectedVibes.length > 0 ? '#F3EEE7' : '#FFFFFF',
                          border: '1px solid ' + (selectedVibes.length > 0 ? '#C67D34' : '#EAE3D9'),
                          borderRadius: 8,
                          padding: '6px 11px',
                          color: '#261C14',
                          cursor: 'pointer',
                          fontSize: 12,
                          fontWeight: 500,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                        }}
                      >
                        <Coffee size={13} /> Không gian {selectedVibes.length > 0 && `(${selectedVibes.length})`}
                      </button>
                    </Dropdown>

                    <Dropdown menu={{ items: amenityItems }} trigger={['click']}>
                      <button
                        style={{
                          background: selectedAmenities.length > 0 ? '#F3EEE7' : '#FFFFFF',
                          border: '1px solid ' + (selectedAmenities.length > 0 ? '#C67D34' : '#EAE3D9'),
                          borderRadius: 8,
                          padding: '6px 11px',
                          color: '#261C14',
                          cursor: 'pointer',
                          fontSize: 12,
                          fontWeight: 500,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                        }}
                      >
                        <Plug size={13} /> Tiện ích {selectedAmenities.length > 0 && `(${selectedAmenities.length})`}
                      </button>
                    </Dropdown>

                    <Dropdown menu={{ items: sortItems }} trigger={['click']}>
                      <button
                        style={{
                          background: '#FFFFFF',
                          border: '1px solid #EAE3D9',
                          borderRadius: 8,
                          padding: '6px 11px',
                          color: '#261C14',
                          cursor: 'pointer',
                          fontSize: 12,
                          fontWeight: 500,
                        }}
                      >
                        Sắp xếp ▾
                      </button>
                    </Dropdown>

                    <button
                      onClick={() => toggleFollowOnHover(!followOnHover)}
                      title="Bật: di chuột lên quán thì bản đồ bay tới quán đó. Tắt: bản đồ đứng yên, bấm vào quán để xem chi tiết."
                      style={{
                        background: followOnHover ? '#6F4E37' : '#FFFFFF',
                        border: '1px solid ' + (followOnHover ? '#6F4E37' : '#EAE3D9'),
                        borderRadius: 8,
                        padding: '6px 11px',
                        color: followOnHover ? '#FFFFFF' : '#261C14',
                        cursor: 'pointer',
                        fontSize: 12,
                        fontWeight: 500,
                      }}
                    >
                      Bám bản đồ: {followOnHover ? 'Bật' : 'Tắt'}
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Study & Coffee Focus Hero Bar */}
            {/* Quick Study Filter Pills Bar */}
            <div
              style={{
                padding: isMobile ? '8px 12px' : '10px 16px',
                display: 'flex',
                flexWrap: 'wrap',
                gap: 6,
                alignItems: 'center',
              }}
            >
              <button
                  onClick={() => {
                    const has = selectedAmenities.includes('24h');
                    setSelectedAmenities(has ? selectedAmenities.filter((a) => a !== '24h') : [...selectedAmenities, '24h']);
                  }}
                  style={{
                    background: selectedAmenities.includes('24h') ? '#4A2E18' : '#FFFFFF',
                    color: selectedAmenities.includes('24h') ? '#FFFFFF' : '#4A2E18',
                    border: '1px solid ' + (selectedAmenities.includes('24h') ? '#4A2E18' : '#EAE3D9'),
                    borderRadius: 16,
                    padding: '4px 11px',
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    transition: 'all 0.18s ease',
                    boxShadow: selectedAmenities.includes('24h') ? '0 2px 8px rgba(74, 46, 24, 0.25)' : 'none',
                  }}
                >
                  <Clock size={12} />
                  <span>Cú đêm 24/7</span>
                </button>
                <button
                  onClick={() => {
                    const has = selectedAmenities.includes('socket');
                    setSelectedAmenities(has ? selectedAmenities.filter((a) => a !== 'socket') : [...selectedAmenities, 'socket']);
                  }}
                  style={{
                    background: selectedAmenities.includes('socket') ? '#4A2E18' : '#FFFFFF',
                    color: selectedAmenities.includes('socket') ? '#FFFFFF' : '#4A2E18',
                    border: '1px solid ' + (selectedAmenities.includes('socket') ? '#4A2E18' : '#EAE3D9'),
                    borderRadius: 16,
                    padding: '4px 11px',
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    transition: 'all 0.18s ease',
                    boxShadow: selectedAmenities.includes('socket') ? '0 2px 8px rgba(74, 46, 24, 0.25)' : 'none',
                  }}
                >
                  <Zap size={12} />
                  <span>Ổ cắm từng bàn</span>
                </button>
                <button
                  onClick={() => {
                    const has = selectedVibes.includes('quiet');
                    setSelectedVibes(has ? selectedVibes.filter((v) => v !== 'quiet') : [...selectedVibes, 'quiet']);
                  }}
                  style={{
                    background: selectedVibes.includes('quiet') ? '#2D5A43' : '#FFFFFF',
                    color: selectedVibes.includes('quiet') ? '#FFFFFF' : '#2D5A43',
                    border: '1px solid ' + (selectedVibes.includes('quiet') ? '#2D5A43' : '#EAE3D9'),
                    borderRadius: 16,
                    padding: '4px 11px',
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    transition: 'all 0.18s ease',
                    boxShadow: selectedVibes.includes('quiet') ? '0 2px 8px rgba(45, 90, 67, 0.25)' : 'none',
                  }}
                >
                  <VolumeX size={12} />
                  <span>Rất yên tĩnh</span>
                </button>
                <button
                  onClick={() => {
                    const has = selectedAmenities.includes('wifi');
                    setSelectedAmenities(has ? selectedAmenities.filter((a) => a !== 'wifi') : [...selectedAmenities, 'wifi']);
                  }}
                  style={{
                    background: selectedAmenities.includes('wifi') ? '#2D5A43' : '#FFFFFF',
                    color: selectedAmenities.includes('wifi') ? '#FFFFFF' : '#2D5A43',
                    border: '1px solid ' + (selectedAmenities.includes('wifi') ? '#2D5A43' : '#EAE3D9'),
                    borderRadius: 16,
                    padding: '4px 11px',
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    transition: 'all 0.18s ease',
                    boxShadow: selectedAmenities.includes('wifi') ? '0 2px 8px rgba(45, 90, 67, 0.25)' : 'none',
                  }}
                >
                  <Wifi size={12} />
                  <span>Wi-Fi mạnh</span>
                </button>
                <button
                  onClick={() => {
                    const has = selectedVibes.includes('group');
                    setSelectedVibes(has ? selectedVibes.filter((v) => v !== 'group') : [...selectedVibes, 'group']);
                  }}
                  style={{
                    background: selectedVibes.includes('group') ? '#C67D34' : '#FFFFFF',
                    color: selectedVibes.includes('group') ? '#FFFFFF' : '#C67D34',
                    border: '1px solid ' + (selectedVibes.includes('group') ? '#C67D34' : '#EAE3D9'),
                    borderRadius: 16,
                    padding: '4px 11px',
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    transition: 'all 0.18s ease',
                    boxShadow: selectedVibes.includes('group') ? '0 2px 8px rgba(198, 125, 52, 0.25)' : 'none',
                  }}
                >
                  <Users size={12} />
                  <span>Học nhóm</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleToggleRadius(1)}
                  disabled={locating}
                  style={{
                    background: maxDistanceKm === 1 ? '#2D5A43' : '#FFFFFF',
                    color: maxDistanceKm === 1 ? '#FFFFFF' : '#2D5A43',
                    border: '1px solid ' + (maxDistanceKm === 1 ? '#2D5A43' : '#B8DCC6'),
                    borderRadius: 16,
                    padding: '4px 11px',
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    transition: 'all 0.18s ease',
                    boxShadow: maxDistanceKm === 1 ? '0 2px 8px rgba(45, 90, 67, 0.25)' : 'none',
                  }}
                >
                  <Navigation size={12} />
                  <span>{locating && maxDistanceKm === 1 ? 'Đang định vị…' : 'Gần tôi < 1km'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleToggleRadius(3)}
                  disabled={locating}
                  style={{
                    background: maxDistanceKm === 3 ? '#2D5A43' : '#FFFFFF',
                    color: maxDistanceKm === 3 ? '#FFFFFF' : '#2D5A43',
                    border: '1px solid ' + (maxDistanceKm === 3 ? '#2D5A43' : '#B8DCC6'),
                    borderRadius: 16,
                    padding: '4px 11px',
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    transition: 'all 0.18s ease',
                    boxShadow: maxDistanceKm === 3 ? '0 2px 8px rgba(45, 90, 67, 0.25)' : 'none',
                  }}
                >
                  <Compass size={12} />
                  <span>Bán kính &lt; 3km</span>
                </button>
            </div>

            {/* Place Cards List */}
            <div style={{ padding: isMobile ? 12 : 16, flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {loading ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <PlaceCardSkeleton />
                  <PlaceCardSkeleton />
                  <PlaceCardSkeleton />
                  <PlaceCardSkeleton />
                </div>
              ) : filteredPlaces.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px 0' }}>
                  <Empty
                    description={
                      places.length === 0 && bounds
                        ? 'Không có quán nào trong vùng bản đồ đang xem — thu nhỏ bản đồ để thấy thêm quán'
                        : 'Không tìm thấy quán nào phù hợp với bộ lọc'
                    }
                  />
                </div>
              ) : (
                filteredPlaces.map((place) => {
                  const snap = place.snapshot || {};
                  const isFav = favoritePlaceIds.includes(place.placeId);
                  const isSelected = selectedPlaceId === place.placeId;
                  const openInfo = getDetailedOpenStatus(place);
                  return (
                    <motion.div
                      key={place.placeId}
                      layout
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2 }}
                      whileHover={{ y: -3 }}
                      onClick={() => navigate(`/places/${place.slug}`)}
                      style={{
                        background: '#FFFFFF',
                        border: isSelected ? '2px solid #C67D34' : '1px solid #EAE3D9',
                        borderRadius: 14,
                        overflow: 'hidden',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: isMobile ? 'column' : 'row',
                        gap: 14,
                        padding: 12,
                        boxShadow: isSelected ? '0 8px 24px rgba(198, 125, 52, 0.18)' : '0 2px 8px rgba(74, 46, 24, 0.04)',
                        transition: 'border-color 0.18s, box-shadow 0.18s',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = '#C67D34';
                        e.currentTarget.style.boxShadow = '0 8px 20px rgba(74, 46, 24, 0.1)';
                        const img = e.currentTarget.querySelector('img');
                        if (img) img.style.transform = 'scale(1.05)';
                        if (followOnHover) setSelectedPlaceId(place.placeId);
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = isSelected ? '#C67D34' : '#EAE3D9';
                        e.currentTarget.style.boxShadow = isSelected ? '0 8px 24px rgba(198, 125, 52, 0.18)' : '0 2px 8px rgba(74, 46, 24, 0.04)';
                        const img = e.currentTarget.querySelector('img');
                        if (img) img.style.transform = 'none';
                      }}
                    >
                      {/* Photo - Chiếm diện tích nổi bật, ưu tiên thị giác */}
                      <div
                        style={{
                          width: isMobile ? '100%' : 220,
                          height: isMobile ? 180 : 150,
                          borderRadius: 12,
                          background: '#F3EEE7',
                          overflow: 'hidden',
                          position: 'relative',
                          flexShrink: 0,
                        }}
                      >
                        {place.coverPhoto?.publicUrl ? (
                          <img
                            src={place.coverPhoto.publicUrl}
                            alt={place.name}
                            style={{ width: '100%', height: '100%', objectFit: 'cover', transition: 'transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)' }}
                          />
                        ) : (
                          <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#7A6C60', fontSize: 12, gap: 4 }}>
                            <Coffee size={28} color="#C67D34" />
                            <span>Quán Học Bài</span>
                          </div>
                        )}

                        {/* Rating Badge Overlay trên ảnh */}
                        {place.ratingOverall > 0 && (
                          <div
                            style={{
                              position: 'absolute',
                              top: 8,
                              left: 8,
                              background: 'rgba(26, 18, 11, 0.8)',
                              backdropFilter: 'blur(6px)',
                              borderRadius: 6,
                              padding: '2px 7px',
                              color: '#FFD700',
                              fontSize: 11,
                              fontWeight: 700,
                              display: 'flex',
                              alignItems: 'center',
                              gap: 4,
                              boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
                            }}
                          >
                            <Star size={11} fill="#FFD700" stroke="#FFD700" />
                            <span style={{ color: '#FFFFFF' }}>{place.ratingOverall}</span>
                          </div>
                        )}

                        {/* Photo Count Badge Overlay góc dưới ảnh */}
                        <div
                          style={{
                            position: 'absolute',
                            bottom: 8,
                            right: 8,
                            background: 'rgba(0, 0, 0, 0.65)',
                            backdropFilter: 'blur(6px)',
                            borderRadius: 6,
                            padding: '2px 7px',
                            color: '#FFFFFF',
                            fontSize: 11,
                            fontWeight: 600,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                          }}
                        >
                          <Camera size={12} />
                          <span>{snap.gallery?.length || 5} ảnh</span>
                        </div>

                        <button
                          onClick={(e) => handleToggleFavorite(e, place.placeId)}
                          style={{
                            position: 'absolute',
                            top: 8,
                            right: 8,
                            background: 'rgba(255,255,255,0.92)',
                            backdropFilter: 'blur(4px)',
                            border: 'none',
                            borderRadius: '50%',
                            width: 28,
                            height: 28,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            boxShadow: '0 2px 6px rgba(0,0,0,0.12)',
                          }}
                        >
                          {isFav ? (
                            <Heart size={16} color="#B5484D" fill="#B5484D" />
                          ) : (
                            <Heart size={16} color="#261C14" />
                          )}
                        </button>
                      </div>

                      {/* Info */}
                      <div
                        style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}
                      >
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                            <span style={{ fontSize: 15, fontWeight: 700, color: '#261C14', lineHeight: 1.3 }}>{place.name}</span>
                          </div>

                          <div style={{ fontSize: 12, color: '#7A6C60', marginTop: 4, display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                              {place.address || snap.address || 'Chưa có địa chỉ'}
                            </span>
                            {typeof place._distanceKm === 'number' && (
                              <Tag style={{ fontSize: 10, margin: 0, padding: '1px 6px', background: '#E6F4EA', color: '#137333', border: '1px solid #CEEAD6', borderRadius: 6, fontWeight: 700, flexShrink: 0 }}>
                                {formatDistanceBadge(place._distanceKm)}
                              </Tag>
                            )}
                          </div>
                        </div>

                        {/* 2-3 High-priority Tags (Gọn gàng, thoáng mắt, không rối chữ) */}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                          {/* Tag 1: Trạng thái mở cửa */}
                          <span
                            style={{
                              fontSize: 11,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              background: openInfo.bg,
                              color: openInfo.color,
                              border: `1px solid ${openInfo.border}`,
                              borderRadius: 6,
                              padding: '2px 8px',
                              fontWeight: 600,
                            }}
                          >
                            <Clock size={11} />
                            {openInfo.text}
                          </span>

                          {/* Tag 2: Đặc điểm học bài nổi bật nhất */}
                          {snap.studentDiscountDetails ? (
                            <span
                              style={{
                                fontSize: 11,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                background: '#FFF7E6',
                                color: '#C67D34',
                                border: '1px solid #FFD591',
                                borderRadius: 6,
                                padding: '2px 8px',
                                fontWeight: 600,
                              }}
                            >
                              <GraduationCap size={12} />
                              Ưu đãi SV
                            </span>
                          ) : snap.amenities?.noiseLevel === 'QUIET' || snap.amenities?.noiseLevel === 'SILENT' ? (
                            <span
                              style={{
                                fontSize: 11,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                background: '#EDF4F0',
                                color: '#2D5A43',
                                border: '1px solid #CADDCF',
                                borderRadius: 6,
                                padding: '2px 8px',
                                fontWeight: 600,
                              }}
                            >
                              <VolumeX size={12} />
                              Thư viện
                            </span>
                          ) : ['MANY', 'EVERY_TABLE'].includes(snap.amenities?.socketDensity) ? (
                            <span
                              style={{
                                fontSize: 11,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                background: '#F5EFEB',
                                color: '#6F4E37',
                                border: '1px solid #E4D5CA',
                                borderRadius: 6,
                                padding: '2px 8px',
                                fontWeight: 600,
                              }}
                            >
                              <Zap size={11} />
                              Ổ cắm sạc
                            </span>
                          ) : ['STRONG'].includes(snap.amenities?.wifiQuality) ? (
                            <span
                              style={{
                                fontSize: 11,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                background: '#EDF4F0',
                                color: '#2D5A43',
                                border: '1px solid #CADDCF',
                                borderRadius: 6,
                                padding: '2px 8px',
                                fontWeight: 600,
                              }}
                            >
                              <Wifi size={11} />
                              Wi-Fi mạnh
                            </span>
                          ) : null}

                          {/* Tag 3: Giá sinh viên */}
                          {place.priceMin && (
                            <span
                              style={{
                                fontSize: 11,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                background: '#FDF5EC',
                                color: '#8C5326',
                                border: '1px solid #F0D5BE',
                                borderRadius: 6,
                                padding: '2px 8px',
                                fontWeight: 600,
                              }}
                            >
                              <Coffee size={11} />
                              Từ {place.priceMin.toLocaleString('vi-VN')}đ
                            </span>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* MAP PANEL (Shown if Desktop OR Mobile in 'map' view) */}
        {(!isMobile || mobileView === 'map') && (
          <div style={{ flex: 1, height: '100%', width: isMobile ? '100%' : '52%', position: 'relative' }}>
            <MapLibreView
              places={mapPlaces}
              selectedPlaceId={selectedPlaceId}
              onSelectPlace={(p) => setSelectedPlaceId(p ? p.placeId : null)}
              onBoundsChange={handleBoundsChange}
              height="100%"
            />
          </div>
        )}
      </div>

      {/* MOBILE FILTER DRAWER */}
      <Drawer
        title="Bộ Lọc Tìm Kiếm"
        placement="bottom"
        size="70%"
        open={filterDrawerOpen}
        onClose={() => setFilterDrawerOpen(false)}
        style={{ background: '#FFFFFF', color: '#1F2421' }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, color: '#1F2421' }}>
          <div>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Không gian & Không khí</div>
            <Checkbox.Group
              options={[
                { label: 'Yên tĩnh học bài / làm việc', value: 'quiet' },
                { label: 'Thảo luận & Họp nhóm', value: 'group' },
                { label: 'Chill & View đẹp thư giãn', value: 'chill' },
              ]}
              value={selectedVibes}
              onChange={(vals) => setSelectedVibes(vals as string[])}
            />
          </div>

          <div>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Tiện ích sinh viên</div>
            <Checkbox.Group
              options={[
                { label: 'Wi-Fi Tốc Độ Cao', value: 'wifi' },
                { label: 'Nhiều Ổ Cắm Từng Bàn', value: 'socket' },
                { label: 'Có Máy Lạnh / Điều Hòa', value: 'aircon' },
                { label: 'Mở Cửa 24/24 Xuyên Đêm', value: '24h' },
              ]}
              value={selectedAmenities}
              onChange={(vals) => setSelectedAmenities(vals as string[])}
            />
          </div>

          <div>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Khoảng cách gần bạn</div>
            <Radio.Group
              value={maxDistanceKm ?? 'all'}
              onChange={(e) => {
                const v = e.target.value;
                if (v === 'all') {
                  setMaxDistanceKm(null);
                } else {
                  handleToggleRadius(Number(v));
                }
              }}
            >
              <Space direction="vertical">
                <Radio value="all">Tất cả khoảng cách</Radio>
                <Radio value={1}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <Navigation size={13} /> Đi bộ (&lt; 1km)
                  </span>
                </Radio>
                <Radio value={3}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <Bike size={13} /> Xe máy (&lt; 3km)
                  </span>
                </Radio>
              </Space>
            </Radio.Group>
          </div>

          <div>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Sắp xếp theo</div>
            <Radio.Group value={sortBy} onChange={(e) => setSortBy(e.target.value as any)}>
              <Radio value="rating">Đánh giá cao nhất</Radio>
              <Radio value="distance">Gần tôi nhất</Radio>
              <Radio value="priceAsc">Giá thấp đến cao</Radio>
              <Radio value="priceDesc">Giá cao đến thấp</Radio>
            </Radio.Group>
          </div>

          <Button
            type="primary"
            block
            size="large"
            onClick={() => setFilterDrawerOpen(false)}
            style={{ marginTop: 12 }}
          >
            Áp Dụng Bộ Lọc ({filterCount})
          </Button>
        </div>
      </Drawer>

      <PlaceContributionModal
        visible={contribModalOpen}
        onClose={() => setContribModalOpen(false)}
        onSuccess={() => {
          setContribModalOpen(false);
          fetchPlaces(true);
        }}
      />
    </div>
  );
};
export default DiscoverPage;
