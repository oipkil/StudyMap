import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { Card, Typography, Row, Col, Tag, Button, message, Tooltip } from 'antd';
import { NOISE_LABEL, labelOf } from '../../utils/amenityLabels';
import { Activity, VolumeX, Headphones, Users, Clock, Flame, AlertTriangle, CheckCircle2, AlertCircle, XCircle, CircleCheck } from 'lucide-react';

const { Title, Text } = Typography;

interface StudyAtmosphereMeterProps {
  placeId: string;
  placeName?: string;
  noiseLevel?: string; // 'SILENT' | 'QUIET' | 'MODERATE' | 'LOUD'
  socketDensity?: string;
  wifiQuality?: string;
  motorcycleParking?: string;
  is24h?: boolean;
  /** Mức đông theo khung giờ, lấy từ trường động crowd_* (chưa nhập thì để trống) */
  crowdByBlock?: Record<string, string | null>;
  /** Mở hộp đóng góp thông tin khi quán chưa có dữ liệu */
  onContribute?: () => void;
}

interface SeatSummary {
  status: 'PLENTY' | 'FEW' | 'FULL' | null;
  counts: Record<string, number>;
  total: number;
  lastReportedAt: string | null;
  windowMinutes: number;
  myStatus: string | null;
}

/** Mức đông -> chiều cao cột trong biểu đồ (chỉ vẽ khung giờ đã có dữ liệu). */
const CROWD_META: Record<string, { height: number; color: string; isPeak?: boolean }> = {
  'Vắng': { height: 28, color: '#2D5A43' },
  'Vừa phải': { height: 52, color: '#6F4E37' },
  'Đông': { height: 78, color: '#C67D34' },
  'Rất đông': { height: 95, color: '#D46B08', isPeak: true },
  'Đóng cửa': { height: 12, color: '#D5C8BA' },
};

export const StudyAtmosphereMeter: React.FC<StudyAtmosphereMeterProps> = ({
  placeId,
  noiseLevel = 'QUIET',
  crowdByBlock,
  onContribute,
}) => {
  // Tình trạng chỗ ngồi: lấy từ API thật (tổng hợp báo cáo của sinh viên trong 2 giờ gần nhất)
  const [seat, setSeat] = useState<SeatSummary | null>(null);
  const [voting, setVoting] = useState(false);

  const loadSeat = useCallback(async () => {
    try {
      const res = await axios.get(`/api/v1/places/${placeId}/seat-status`);
      setSeat(res.data?.data ?? null);
    } catch {
      setSeat(null);
    }
  }, [placeId]);

  useEffect(() => {
    loadSeat();
  }, [loadSeat]);

  const handleVoteSeat = async (status: 'PLENTY' | 'FEW' | 'FULL') => {
    setVoting(true);
    try {
      const res = await axios.post(`/api/v1/places/${placeId}/seat-status`, { status });
      setSeat(res.data?.data ?? null);
      message.success('Cảm ơn bạn đã cập nhật tình trạng chỗ ngồi giúp các bạn sinh viên khác!');
    } catch (err: any) {
      if (err.response?.status === 401) message.info('Đăng nhập để báo tình trạng chỗ ngồi');
      else message.warning(err.response?.data?.message || 'Chưa gửi được báo cáo, thử lại sau');
      if (err.response?.data?.data) setSeat(err.response.data.data);
    } finally {
      setVoting(false);
    }
  };

  const currentSeatStatus = seat?.status ?? null;
  const votesCount = seat?.total ?? 0;
  const userVoted = Boolean(seat?.myStatus);

  // 3 Mức độ âm thanh trực quan
  const isSilent = noiseLevel === 'SILENT';
  const isQuiet = noiseLevel === 'QUIET' || isSilent;
  const isModerate = noiseLevel === 'MODERATE';
  const isLoud = noiseLevel === 'LOUD';

  // Biểu đồ giờ đông khách: dựng từ trường động crowd_* do admin / sinh viên nhập, KHÔNG bịa số liệu
  const currentHour = new Date().getHours();
  const BLOCKS = [
    { key: 'crowd_morning', label: '07h - 11h', name: 'Sáng sớm', from: 7, to: 11 },
    { key: 'crowd_noon', label: '11h - 14h', name: 'Trưa', from: 11, to: 14 },
    { key: 'crowd_afternoon', label: '14h - 18h', name: 'Chiều', from: 14, to: 18 },
    { key: 'crowd_evening', label: '18h - 22h', name: 'Tối ôn bài', from: 18, to: 22 },
    { key: 'crowd_latenight', label: '22h - 04h', name: 'Khuya', from: 22, to: 31 },
  ];
  const timeBlocks = BLOCKS.map((b) => {
    const crowd = crowdByBlock?.[b.key] || null;
    const meta = crowd ? CROWD_META[crowd] : null;
    const hourNow = b.to > 24 ? (currentHour >= b.from || currentHour < b.to - 24) : currentHour >= b.from && currentHour < b.to;
    return { ...b, crowd, height: meta?.height ?? 0, color: meta?.color ?? '#EAE3D9', isPeak: meta?.isPeak, active: hourNow };
  });
  const hasCrowdData = timeBlocks.some((b) => b.crowd);
  const peakBlock = timeBlocks.filter((b) => b.crowd).sort((a, b) => b.height - a.height)[0] || null;

  return (
    <Card
      style={{
        borderRadius: 14,
        border: '1px solid #EAE3D9',
        boxShadow: '0 4px 18px rgba(74, 46, 24, 0.05)',
        background: '#FFFFFF',
        marginTop: 20,
        marginBottom: 20,
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 8,
              background: '#F5EFEB',
              border: '1px solid #E4D5CA',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#6F4E37',
            }}
          >
            <Activity size={18} />
          </div>
          <div>
            <Title level={4} style={{ margin: 0, color: '#4A2E18', fontWeight: 800 }}>
              Độ Ồn & Chỗ Ngồi Trực Tiếp
            </Title>
          </div>
        </div>
      </div>

      <Row gutter={[16, 16]}>
        {/* 1. THƯỚC ĐO ĐỘ ỒN (NOISE LEVEL METER) */}
        <Col xs={24} lg={12}>
          <div
            style={{
              background: '#FAF7F2',
              borderRadius: 12,
              padding: '16px 18px',
              border: '1px solid #EAE3D9',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <Text strong style={{ color: '#4A2E18', fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <VolumeX size={16} color="#6F4E37" /> Mức Độ Yên Tĩnh
                </Text>
                <Tag color={isQuiet ? 'green' : isLoud ? 'orange' : 'blue'} style={{ fontWeight: 700, borderRadius: 6 }}>
                  {labelOf(NOISE_LABEL, noiseLevel)}
                </Tag>
              </div>

              {/* 3 Nấc Độ Ồn Trực Quan Gọn Gàng */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 8 }}>
                {[
                  { key: 'quiet', icon: <VolumeX size={20} />, title: 'Thư viện', sub: '< 45 dB', active: isQuiet, color: '#2D5A43', bg: '#EDF4F0' },
                  { key: 'mod', icon: <Headphones size={20} />, title: 'Vừa phải', sub: '45 - 65 dB', active: isModerate, color: '#6F4E37', bg: '#F5EFEB' },
                  { key: 'loud', icon: <Users size={20} />, title: 'Sôi động', sub: '> 65 dB', active: isLoud, color: '#C67D34', bg: '#FFF7E6' },
                ].map((item) => (
                  <div
                    key={item.key}
                    style={{
                      padding: '14px 6px',
                      borderRadius: 10,
                      textAlign: 'center',
                      background: item.active ? item.bg : '#FFFFFF',
                      border: item.active ? `2px solid ${item.color}` : '1px solid #EAE3D9',
                      boxShadow: item.active ? `0 2px 8px ${item.color}25` : 'none',
                      transition: 'all 0.2s ease',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                    }}
                  >
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: '50%',
                        background: item.active ? '#FFFFFF' : item.bg,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: item.color,
                        marginBottom: 6,
                      }}
                    >
                      {item.icon}
                    </div>
                    <div style={{ fontSize: 13, fontWeight: item.active ? 800 : 600, color: item.active ? item.color : '#3E2415' }}>
                      {item.title}
                    </div>
                    <div style={{ fontSize: 11, color: '#7A6C60', marginTop: 2 }}>
                      {item.sub}
                    </div>
                    {item.active && (
                      <div style={{ fontSize: 11, fontWeight: 700, color: item.color, marginTop: 4 }}>
                        ✓ Đang đạt
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Col>

        {/* 2. BIỂU ĐỒ GIỜ CAO ĐIỂM & TÌNH TRẠNG CHỖ NGỒI */}
        <Col xs={24} lg={12}>
          <div
            style={{
              background: '#FAF7F2',
              borderRadius: 12,
              padding: '16px 18px',
              border: '1px solid #EAE3D9',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <Text strong style={{ color: '#4A2E18', fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Clock size={16} color="#6F4E37" /> Thời Điểm Đông Khách
                </Text>
                {peakBlock ? (
                  <Tag color="orange" style={{ fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <Flame size={12} /> Đông nhất {peakBlock.label}
                  </Tag>
                ) : (
                  <Tag style={{ fontWeight: 600 }}>Chưa có dữ liệu</Tag>
                )}
              </div>

              {/* Visual Bar Chart */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-end',
                  justifyContent: 'space-between',
                  height: 120,
                  padding: '10px 10px 0 10px',
                  background: '#FFFFFF',
                  borderRadius: 10,
                  border: '1px solid #EAE3D9',
                  marginBottom: 10,
                }}
              >
                {timeBlocks.map((block, index) => (
                  <div
                    key={index}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      flex: 1,
                      height: '100%',
                      justifyContent: 'flex-end',
                    }}
                  >
                    <Tooltip title={`${block.name}: ${block.crowd} (${block.height}%)`}>
                      <div
                        style={{
                          width: '70%',
                          maxWidth: 32,
                          height: `${block.height}%`,
                          background: block.isPeak
                            ? 'linear-gradient(180deg, #D46B08 0%, #C67D34 100%)'
                            : block.color,
                          borderRadius: '6px 6px 0 0',
                          position: 'relative',
                          transition: 'all 0.3s ease',
                          cursor: 'pointer',
                          boxShadow: block.active ? '0 0 0 2px #4A2E18' : 'none',
                        }}
                      >
                        {block.active && (
                          <div
                            style={{
                              position: 'absolute',
                              top: -8,
                              left: '50%',
                              transform: 'translateX(-50%)',
                              width: 6,
                              height: 6,
                              borderRadius: '50%',
                              background: '#D46B08',
                            }}
                          />
                        )}
                      </div>
                    </Tooltip>
                    <span style={{ fontSize: 10, fontWeight: block.active ? 800 : 500, color: block.active ? '#3E2415' : '#7A6C60', marginTop: 6, whiteSpace: 'nowrap' }}>
                      {block.label}
                    </span>
                  </div>
                ))}
              </div>

              {/* Gợi ý cao điểm */}
              {peakBlock && peakBlock.crowd !== 'Vắng' && (
                <div style={{ fontSize: 12, color: '#D46B08', display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                  <AlertTriangle size={13} style={{ flexShrink: 0 }} />
                  <span>Nên ghé trước {peakBlock?.label?.split(' - ')[0]} để dễ tìm chỗ có ổ cắm.</span>
                </div>
              )}

              {!hasCrowdData && (
                <div style={{ background: '#FAF7F2', border: '1px dashed #EAE3D9', borderRadius: 10, padding: '10px 12px', fontSize: 12, color: '#7A6C60', textAlign: 'center' }} data-testid="crowd-empty">
                  Quán chưa có dữ liệu giờ đông khách.{' '}
                  {onContribute ? (
                    <Button type="link" size="small" style={{ padding: 0, height: 'auto', fontSize: 12 }} onClick={onContribute}>
                      Góp thông tin giúp các bạn khác
                    </Button>
                  ) : (
                    'Bạn có thể góp thông tin ở mục Báo sửa / Đóng góp.'
                  )}
                </div>
              )}
            </div>

            {/* Khảo sát nhanh tình trạng chỗ ngồi */}
            <div style={{ marginTop: 14, paddingTop: 10, borderTop: '1px solid #EAE3D9' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <Text strong style={{ fontSize: 12, color: '#3E2415' }}>
                  Hiện tại quán còn bàn không? ({votesCount > 0 ? `${votesCount} lượt báo trong ${Math.round((seat?.windowMinutes ?? 120) / 60)} giờ qua` : 'chưa có ai báo'})
                </Text>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    color: currentSeatStatus === 'PLENTY' ? '#2D5A43' : currentSeatStatus === 'FEW' ? '#D46B08' : currentSeatStatus === 'FULL' ? '#CF1322' : '#7A6C60',
                  }}
                >
                  {currentSeatStatus === 'PLENTY' ? (
                    <>
                      <CheckCircle2 size={12} />
                      <span>Còn nhiều bàn</span>
                    </>
                  ) : currentSeatStatus === 'FEW' ? (
                    <>
                      <AlertCircle size={12} />
                      <span>Gần hết bàn</span>
                    </>
                  ) : currentSeatStatus === 'FULL' ? (
                    <>
                      <XCircle size={12} />
                      <span>Kín chỗ</span>
                    </>
                  ) : (
                    'Chưa rõ'
                  )}
                </span>
              </div>

              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <Button
                  size="small"
                  loading={voting}
                  icon={<CheckCircle2 size={13} style={{ verticalAlign: 'middle', marginRight: 2 }} />}
                  onClick={() => handleVoteSeat('PLENTY')}
                  style={{
                    fontSize: 12,
                    borderRadius: 8,
                    borderColor: currentSeatStatus === 'PLENTY' ? '#2D5A43' : '#EAE3D9',
                    background: currentSeatStatus === 'PLENTY' ? '#EDF4F0' : '#FFFFFF',
                    color: currentSeatStatus === 'PLENTY' ? '#2D5A43' : '#3E2415',
                    fontWeight: currentSeatStatus === 'PLENTY' ? 700 : 500,
                    display: 'inline-flex',
                    alignItems: 'center',
                  }}
                >
                  Còn nhiều bàn
                </Button>
                <Button
                  size="small"
                  loading={voting}
                  icon={<AlertCircle size={13} style={{ verticalAlign: 'middle', marginRight: 2 }} />}
                  onClick={() => handleVoteSeat('FEW')}
                  style={{
                    fontSize: 12,
                    borderRadius: 8,
                    borderColor: currentSeatStatus === 'FEW' ? '#C67D34' : '#EAE3D9',
                    background: currentSeatStatus === 'FEW' ? '#FFF7E6' : '#FFFFFF',
                    color: currentSeatStatus === 'FEW' ? '#C67D34' : '#3E2415',
                    fontWeight: currentSeatStatus === 'FEW' ? 700 : 500,
                    display: 'inline-flex',
                    alignItems: 'center',
                  }}
                >
                  Gần hết bàn
                </Button>
                <Button
                  size="small"
                  loading={voting}
                  icon={<XCircle size={13} style={{ verticalAlign: 'middle', marginRight: 2 }} />}
                  onClick={() => handleVoteSeat('FULL')}
                  style={{
                    fontSize: 12,
                    borderRadius: 8,
                    borderColor: currentSeatStatus === 'FULL' ? '#CF1322' : '#EAE3D9',
                    background: currentSeatStatus === 'FULL' ? '#FFF1F0' : '#FFFFFF',
                    color: currentSeatStatus === 'FULL' ? '#CF1322' : '#3E2415',
                    fontWeight: currentSeatStatus === 'FULL' ? 700 : 500,
                    display: 'inline-flex',
                    alignItems: 'center',
                  }}
                >
                  Kín chỗ
                </Button>
                {userVoted && (
                  <span style={{ fontSize: 11, color: '#2D5A43', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600 }}>
                    <CircleCheck size="1em" /> Đã ghi nhận bình chọn
                  </span>
                )}
              </div>
            </div>
          </div>
        </Col>
      </Row>
    </Card>
  );
};
