import React, { useState, useEffect, useRef } from 'react';
import { Modal, Button, Typography, Space, Alert, Slider, Row, Col, Card, Tag, Radio, Spin, Pagination } from 'antd';
import { FileSearch, CirclePlay, CirclePause, SkipForward, SkipBack, LayoutGrid, SlidersHorizontal } from 'lucide-react';

const { Text, Title } = Typography;

interface FrameScrubberModalProps {
  visible: boolean;
  asset: any | null;
  onClose: () => void;
}

export const FrameScrubberModal: React.FC<FrameScrubberModalProps> = ({
  visible,
  asset,
  onClose,
}) => {
  const [viewMode, setViewMode] = useState<'scrubber' | 'contact-sheet'>('contact-sheet');
  const [currentFrame, setCurrentFrame] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [manifest, setManifest] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const timerRef = useRef<any>(null);

  useEffect(() => {
    if (visible && asset) {
      setLoading(true);
      fetch(`/api/v1/media/admin/${asset.id}/frames?page=${page}&limit=30`, { credentials: 'include' })
        .then((res) => res.json())
        .then((json) => {
          if (json.success && json.data) {
            setManifest(json.data);
          }
        })
        .catch(console.error)
        .finally(() => setLoading(false));
    } else {
      setManifest(null);
      setCurrentFrame(0);
      setIsPlaying(false);
      setPage(1);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  }, [visible, asset, page]);

  const totalFrames = manifest?.frameCount || asset?.frameCount || 1;

  useEffect(() => {
    if (isPlaying && totalFrames > 1) {
      const delays = manifest?.delays || [200];
      const delay = delays[currentFrame % delays.length] || 200;

      timerRef.current = setTimeout(() => {
        setCurrentFrame((prev) => (prev + 1) % totalFrames);
      }, Math.max(50, delay));
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isPlaying, currentFrame, totalFrames, manifest]);

  if (!asset) return null;

  return (
    <Modal
      title={
        <Space>
          <FileSearch size="1em" style={{ color: '#2F6B4F' }} />
          <span>Kiểm Tra Từng Khung Hình (Contact Sheet & Frame Scrubber)</span>
        </Space>
      }
      open={visible}
      onCancel={() => {
        setIsPlaying(false);
        onClose();
      }}
      footer={[
        <Button key="close" onClick={onClose}>
          Đóng
        </Button>,
      ]}
      width={860}
      destroyOnHidden
    >
      <Spin spinning={loading}>
        <Space orientation="vertical" style={{ width: '100%' }} size="middle">
        {/* Minh bạch kiểm duyệt thủ công */}
        <Alert
          title="Phương Thức Kiểm Duyệt: Thủ Công (Manual Inspection)"
          description="Hiện tại hệ thống hỗ trợ rà soát thủ công từng frame qua Contact Sheet & Scrubber để phát hiện nội dung độc hại thoáng qua (flash frames / stealth frames). Bộ lọc AI NSFW tự động dự kiến sẽ được tích hợp ở Giai đoạn 7 theo lộ trình."
          type="info"
          showIcon
        />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <Title level={5} style={{ margin: 0 }}>
              {asset.originalName}
            </Title>
            <Space wrap style={{ marginTop: 4 }}>
              <Tag color="blue">{asset.mimeType}</Tag>
              <Tag color="magenta">{totalFrames} khung hình (Frames)</Tag>
              <Tag color="cyan">Vòng lặp: {manifest?.loop === 0 ? 'Vô hạn (0)' : manifest?.loop || 'Mặc định'}</Tag>
            </Space>
          </div>

          <Radio.Group
            value={viewMode}
            onChange={(e) => {
              setIsPlaying(false);
              setViewMode(e.target.value);
            }}
            buttonStyle="solid"
          >
            <Radio.Button value="contact-sheet">
              <LayoutGrid size="1em" /> Contact Sheet (Lưới)
            </Radio.Button>
            <Radio.Button value="scrubber">
              <SlidersHorizontal size="1em" /> Tua Khung Hình (Scrubber)
            </Radio.Button>
          </Radio.Group>
        </div>

        {viewMode === 'contact-sheet' ? (
          /* CHẾ ĐỘ CONTACT SHEET (LƯỚI TOÀN BỘ KHUNG HÌNH) */
          <div style={{ maxHeight: 460, overflowY: 'auto', paddingRight: 8 }}>
            <Row gutter={[12, 12]}>
              {(manifest?.frames || Array.from({ length: totalFrames })).map((f: any, idx: number) => {
                const frameIndex = typeof f?.frameIndex === 'number' ? f.frameIndex : idx;
                const delay = f?.delay || 100;
                const frameUrl = `/api/v1/media/admin/${asset.id}/frames/${frameIndex}`;

                return (
                  <Col span={6} key={frameIndex}>
                    <Card
                      size="small"
                      hoverable
                      cover={
                        <div
                          style={{
                            height: 110,
                            background: '#000',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            overflow: 'hidden',
                          }}
                        >
                          <img
                            src={frameUrl}
                            alt={`Frame ${frameIndex}`}
                            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                          />
                        </div>
                      }
                      style={{
                        textAlign: 'center',
                        borderColor: currentFrame === frameIndex ? '#2F6B4F' : undefined,
                      }}
                      onClick={() => {
                        setCurrentFrame(frameIndex);
                        setViewMode('scrubber');
                      }}
                    >
                      <Text strong style={{ fontSize: 12 }}>
                        Frame #{frameIndex + 1}
                      </Text>
                      <div>
                        <Text type="secondary" style={{ fontSize: 11 }}>
                          {delay}ms
                        </Text>
                      </div>
                    </Card>
                  </Col>
                );
              })}
            </Row>

            {totalFrames > 30 && (
              <div style={{ textAlign: 'center', marginTop: 16 }}>
                <Space orientation="vertical" align="center">
                  <Tag color="gold">
                    Bản xem mẫu (Khung hình {((page - 1) * 30) + 1} - {Math.min(page * 30, totalFrames)} / Tổng {totalFrames} frames)
                  </Tag>
                  <Pagination
                    current={page}
                    pageSize={30}
                    total={totalFrames}
                    onChange={(p) => setPage(p)}
                    showSizeChanger={false}
                  />
                </Space>
              </div>
            )}
          </div>
        ) : (
          /* CHẾ ĐỘ FRAME SCRUBBER (TUA TỪNG FRAME VỚI SLIDER) */
          <Card style={{ background: '#fafafa' }}>
            <div style={{ textAlign: 'center' }}>
              <div
                style={{
                  height: 280,
                  background: '#141414',
                  borderRadius: 8,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                  margin: '0 auto',
                  maxWidth: 480,
                }}
              >
                <img
                  src={`/api/v1/media/admin/${asset.id}/frames/${currentFrame}`}
                  alt={`Current Frame ${currentFrame}`}
                  style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                />
              </div>

              <div style={{ marginTop: 16 }}>
                <Text strong style={{ fontSize: 14 }}>
                  Khung hình #{currentFrame + 1} / {totalFrames}
                </Text>
                <div>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    Độ trễ: {manifest?.delays?.[currentFrame % (manifest?.delays?.length || 1)] || 100} ms
                  </Text>
                </div>
              </div>

              {/* Slider kéo frame */}
              <div style={{ maxWidth: 480, margin: '12px auto' }}>
                <Slider
                  min={0}
                  max={Math.max(0, totalFrames - 1)}
                  value={currentFrame}
                  onChange={(val) => {
                    setIsPlaying(false);
                    setCurrentFrame(val);
                  }}
                  tooltip={{ formatter: (val) => `Frame #${(val ?? 0) + 1}` }}
                />
              </div>

              {/* Controls */}
              <Space size="middle">
                <Button
                  icon={<SkipBack size="1em" />}
                  onClick={() => {
                    setIsPlaying(false);
                    setCurrentFrame((prev) => (prev > 0 ? prev - 1 : totalFrames - 1));
                  }}
                >
                  Frame trước
                </Button>

                <Button
                  type="primary"
                  icon={isPlaying ? <CirclePause size="1em" /> : <CirclePlay size="1em" />}
                  onClick={() => setIsPlaying(!isPlaying)}
                >
                  {isPlaying ? 'Tạm dừng' : 'Phát'}
                </Button>

                <Button
                  icon={<SkipForward size="1em" />}
                  onClick={() => {
                    setIsPlaying(false);
                    setCurrentFrame((prev) => (prev + 1) % totalFrames);
                  }}
                >
                  Frame tiếp
                </Button>
              </Space>
            </div>
          </Card>
        )}
        </Space>
      </Spin>
    </Modal>
  );
};

export default FrameScrubberModal;
