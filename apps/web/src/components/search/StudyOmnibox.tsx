import React, { useState, useEffect, useRef } from 'react';
import { Typography, Tag } from 'antd';
import { Search, CircleX, History, Compass, Zap, GraduationCap, Moon, Plug, VolumeX, Coffee, Users } from 'lucide-react';

const { Text } = Typography;

export interface CampusSuggestion {
  id: string;
  name: string;
  query: string;
  area: string;
}

export interface StudyModeSuggestion {
  id: string;
  label: string;
  query: string;
  filterKey?: string;
  filterValue?: any;
  desc: string;
  badgeIcon?: React.ReactNode;
  badge?: string;
}

const TOP_CAMPUSES: CampusSuggestion[] = [
  {
    id: 'dhqg',
    name: 'ĐHQG-HCM (Làng Đại Học)',
    query: 'Làng Đại Học',
    area: 'KTX Khu A, Khu B, Thủ Đức - Dĩ An',
  },
  {
    id: 'bk',
    name: 'ĐH Bách Khoa TP.HCM',
    query: 'Bách Khoa',
    area: 'Lý Thường Kiệt, Quận 10',
  },
  {
    id: 'ueh',
    name: 'ĐH Kinh Tế TP.HCM (UEH)',
    query: 'Kinh Tế',
    area: 'Nguyễn Tri Phương, Quận 10 & Quận 3',
  },
  {
    id: 'khtn',
    name: 'ĐH Khoa Học Tự Nhiên (HCMUS)',
    query: 'Khoa Học Tự Nhiên',
    area: 'Nguyễn Văn Cừ, Quận 5',
  },
  {
    id: 'hcmute',
    name: 'ĐH Sư Phạm Kỹ Thuật (HCMUTE)',
    query: 'Sư Phạm Kỹ Thuật',
    area: 'Võ Văn Ngân, TP. Thủ Đức',
  },
  {
    id: 'ftu',
    name: 'ĐH Ngoại Thương (FTU CS2)',
    query: 'Ngoại Thương',
    area: 'Đường D5, Bình Thạnh',
  },
];

const STUDY_MODES: StudyModeSuggestion[] = [
  {
    id: '24h',
    label: 'Cú đêm mở 24/7',
    query: '24h',
    filterKey: 'amenity_24h',
    desc: 'Thức đêm ôn thi, chạy deadline đồ án',
    badgeIcon: <Moon size={12} />,
    badge: '24/7',
  },
  {
    id: 'socket',
    label: 'Ổ cắm từng bàn',
    query: 'ổ cắm',
    filterKey: 'amenity_socket',
    desc: 'Sạc laptop, iPad liên tục không lo hết pin',
    badgeIcon: <Plug size={12} />,
    badge: 'Ổ cắm',
  },
  {
    id: 'quiet',
    label: 'Rất yên tĩnh',
    query: 'yên tĩnh',
    filterKey: 'vibe_quiet',
    desc: 'Âm thanh thư viện, tập trung học sâu',
    badgeIcon: <VolumeX size={12} />,
    badge: '< 45dB',
  },
  {
    id: 'price',
    label: 'Giá sinh viên < 35k',
    query: 'sinh viên',
    desc: 'Đồ uống ngon vừa túi tiền, ngồi lâu thoải mái',
    badgeIcon: <Coffee size={12} />,
    badge: 'Tiết kiệm',
  },
  {
    id: 'group',
    label: 'Bàn dài họp nhóm',
    query: 'họp nhóm',
    filterKey: 'amenity_group',
    desc: 'Bàn rộng thảo luận bài tập lớn & đồ án',
    badgeIcon: <Users size={12} />,
    badge: 'Teamwork',
  },
];

interface StudyOmniboxProps {
  value: string;
  onChange: (query: string) => void;
  onSelectSuggestion?: (query: string, filterKey?: string) => void;
  placeholder?: string;
  style?: React.CSSProperties;
}

export const StudyOmnibox: React.FC<StudyOmniboxProps> = ({
  value,
  onChange,
  onSelectSuggestion,
  placeholder = 'Tìm quán cà phê học bài, tên trường, địa chỉ...',
  style,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('studymap_recent_searches');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Click outside listener
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const saveRecentSearch = (term: string) => {
    const trimmed = term.trim();
    if (!trimmed) return;
    const updated = [trimmed, ...recentSearches.filter((s) => s.toLowerCase() !== trimmed.toLowerCase())].slice(0, 6);
    setRecentSearches(updated);
    try {
      localStorage.setItem('studymap_recent_searches', JSON.stringify(updated));
    } catch {
      // ignore
    }
  };

  const removeRecent = (e: React.MouseEvent, term: string) => {
    e.stopPropagation();
    const updated = recentSearches.filter((s) => s !== term);
    setRecentSearches(updated);
    try {
      localStorage.setItem('studymap_recent_searches', JSON.stringify(updated));
    } catch {
      // ignore
    }
  };

  const clearAllRecent = (e: React.MouseEvent) => {
    e.stopPropagation();
    setRecentSearches([]);
    try {
      localStorage.removeItem('studymap_recent_searches');
    } catch {
      // ignore
    }
  };

  const handleSelect = (query: string, filterKey?: string) => {
    onChange(query);
    saveRecentSearch(query);
    if (onSelectSuggestion) {
      onSelectSuggestion(query, filterKey);
    }
    setIsOpen(false);
    inputRef.current?.blur();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (value.trim()) {
        saveRecentSearch(value);
      }
      setIsOpen(false);
      inputRef.current?.blur();
    } else if (e.key === 'Escape') {
      setIsOpen(false);
      inputRef.current?.blur();
    }
  };

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', ...style }}>
      {/* Search Input Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          background: '#FFFFFF',
          border: isOpen ? '1.5px solid #C67D34' : '1px solid #EAE3D9',
          borderRadius: 10,
          padding: '0 12px',
          height: 40,
          boxShadow: isOpen ? '0 0 0 3px rgba(198, 125, 52, 0.15)' : '0 1px 4px rgba(74, 46, 24, 0.04)',
          transition: 'all 0.2s ease',
        }}
      >
        <Search size="1em" style={{ fontSize: 16, color: isOpen ? '#6F4E37' : '#7A6C60', marginRight: 8, flexShrink: 0 }} />
        <input
          ref={inputRef}
          type="text"
          value={value}
          onFocus={() => setIsOpen(true)}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          data-testid="omnibox-input"
          style={{
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: '#261C14',
            fontSize: 13,
            width: '100%',
            fontFamily: 'inherit',
          }}
        />
        {value && (
          <CircleX size="1em"
            onClick={() => {
              onChange('');
              inputRef.current?.focus();
            }}
            style={{ color: '#A89F91', cursor: 'pointer', fontSize: 14, marginLeft: 6 }}
          />
        )}
      </div>

      {/* Omnibox Dropdown Panel */}
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            right: 0,
            background: '#FFFFFF',
            borderRadius: 14,
            border: '1px solid #EAE3D9',
            boxShadow: '0 12px 36px rgba(74, 46, 24, 0.16)',
            zIndex: 100,
            maxHeight: 460,
            overflowY: 'auto',
            padding: '12px 0',
            animation: 'fadeIn 0.15s ease-out',
          }}
        >
          {/* 1. Lịch sử tìm kiếm gần đây */}
          {recentSearches.length > 0 && (
            <div style={{ marginBottom: 12, padding: '0 14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <Text style={{ fontSize: 11, fontWeight: 700, color: '#7A6C60', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  <History size="1em" style={{ marginRight: 4 }} /> Tìm kiếm gần đây
                </Text>
                <button
                  onClick={clearAllRecent}
                  style={{ background: 'transparent', border: 'none', color: '#A89F91', fontSize: 11, cursor: 'pointer' }}
                >
                  Xoá lịch sử
                </button>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {recentSearches.map((term, i) => (
                  <Tag
                    key={i}
                    onClick={() => handleSelect(term)}
                    closable
                    onClose={(e) => removeRecent(e, term)}
                    style={{
                      cursor: 'pointer',
                      background: '#FAF7F2',
                      borderColor: '#EAE3D9',
                      color: '#4A2E18',
                      borderRadius: 16,
                      padding: '2px 10px',
                      fontSize: 12,
                    }}
                  >
                    {term}
                  </Tag>
                ))}
              </div>
            </div>
          )}

          {/* 2. Gợi ý theo Nhu cầu học tập */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ padding: '0 14px 6px 14px' }}>
              <Text style={{ fontSize: 11, fontWeight: 700, color: '#C67D34', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                <Zap size="1em" style={{ marginRight: 4 }} /> Nhu cầu chạy deadline & ôn thi
              </Text>
            </div>
            {STUDY_MODES.map((mode) => (
              <div
                key={mode.id}
                onClick={() => handleSelect(mode.query, mode.filterKey)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 14px',
                  cursor: 'pointer',
                  transition: 'background 0.15s ease',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#FAF7F2')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#3E2415' }}>{mode.label}</span>
                  <span style={{ fontSize: 11, color: '#7A6C60' }}>{mode.desc}</span>
                </div>
                {mode.badge && (
                  <Tag icon={mode.badgeIcon} style={{ background: '#FFF7E6', color: '#C67D34', borderColor: '#FFD591', fontSize: 11, borderRadius: 10, margin: 0, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    {mode.badge}
                  </Tag>
                )}
              </div>
            ))}
          </div>

          {/* 3. Gợi ý theo Khuôn viên Đại học */}
          <div>
            <div style={{ padding: '0 14px 6px 14px', borderTop: '1px solid #F3EEE7', paddingTop: 10 }}>
              <Text style={{ fontSize: 11, fontWeight: 700, color: '#2D5A43', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                <Compass size="1em" style={{ marginRight: 4 }} /> Quán quanh các trường đại học
              </Text>
            </div>
            {TOP_CAMPUSES.map((c) => (
              <div
                key={c.id}
                onClick={() => handleSelect(c.query)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 14px',
                  cursor: 'pointer',
                  transition: 'background 0.15s ease',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#FAF7F2')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <GraduationCap size={16} color="#2D5A43" style={{ flexShrink: 0 }} />
                <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#3E2415' }}>{c.name}</span>
                  <span style={{ fontSize: 11, color: '#7A6C60' }}>{c.area}</span>
                </div>
                <Tag style={{ background: '#EDF4F0', color: '#2D5A43', borderColor: '#CADDCF', fontSize: 11, borderRadius: 10, margin: 0 }}>
                  Tìm quanh trường
                </Tag>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
