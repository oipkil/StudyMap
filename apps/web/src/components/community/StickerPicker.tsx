import React, { useState, useEffect, useMemo } from 'react';
import { Popover, Button, Spin, Empty, Input } from 'antd';
import axios from 'axios';
import { Smile, Search } from 'lucide-react';

export interface StickerItem {
  id: string;
  name: string;
  url: string;
}

export interface StickerPack {
  id: string;
  name: string;
  stickers: StickerItem[];
}

interface StickerPickerProps {
  onSelect: (sticker: StickerItem) => void;
}

/**
 * Bộ chọn nhãn dán gộp: mọi nhãn dán của mọi bộ nằm chung một lưới, hết dòng thì xuống dòng;
 * không hiện tên bộ / tên nhãn (tên chỉ hiện khi rê chuột). Ô tìm chỉ xuất hiện khi có nhiều nhãn.
 */
export const StickerPicker: React.FC<StickerPickerProps> = ({ onSelect }) => {
  const [open, setOpen] = useState(false);
  const [packs, setPacks] = useState<StickerPack[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (open && packs.length === 0) fetchStickerPacks();
    if (!open) setQuery('');
  }, [open]);

  const fetchStickerPacks = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/v1/community/stickers/packs/public');
      if (res.data.success) setPacks(res.data.data);
    } catch (err) {
      console.error('Lỗi khi tải sticker packs:', err);
    } finally {
      setLoading(false);
    }
  };

  const all = useMemo(() => packs.flatMap((p) => p.stickers.map((s) => ({ ...s, packName: p.name }))), [packs]);
  const q = query.trim().toLowerCase();
  const shown = q ? all.filter((s) => s.name.toLowerCase().includes(q) || s.packName.toLowerCase().includes(q)) : all;

  const content = (
    <div style={{ width: 320, maxWidth: 'calc(100vw - 32px)' }} data-testid="sticker-picker">
      {loading ? (
        <div style={{ textAlign: 'center', padding: 24 }}>
          <Spin size="small" />
        </div>
      ) : all.length === 0 ? (
        <Empty description="Chưa có nhãn dán nào" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        <>
          {all.length > 12 && (
            <Input size="small" allowClear prefix={<Search size="1em" style={{ color: '#6F6B66' }} />} placeholder={`Tìm trong ${all.length} nhãn dán…`} value={query} onChange={(e) => setQuery(e.target.value)} style={{ marginBottom: 8 }} />
          )}
          <div style={{ maxHeight: 280, overflowY: 'auto', display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {shown.length === 0 ? (
              <Empty description="Không có nhãn dán khớp" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ width: '100%' }} />
            ) : (
              shown.map((stk) => (
                <button
                  key={stk.id}
                  type="button"
                  onClick={() => {
                    onSelect(stk);
                    setOpen(false);
                  }}
                  title={`${stk.name} · ${stk.packName}`}
                  aria-label={stk.name}
                  style={{ width: 56, height: 56, padding: 4, borderRadius: 8, border: '1px solid transparent', background: 'transparent', cursor: 'pointer' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#F1EFEA')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <img src={stk.url} alt={stk.name} style={{ width: 48, height: 48, objectFit: 'contain', display: 'block' }} />
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );

  return (
    <Popover content={content} title="Nhãn dán" trigger="click" open={open} onOpenChange={setOpen} placement="topLeft">
      <Button icon={<Smile size="1em" />} type="text" shape="circle" title="Thêm nhãn dán" aria-label="Thêm nhãn dán" />
    </Popover>
  );
};

export default StickerPicker;
