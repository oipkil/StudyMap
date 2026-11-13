import React from 'react';

/**
 * Trình hiển thị Markdown tối giản, an toàn (không dùng innerHTML) cho câu trả lời của trợ lý AI:
 * - **đậm**, *nghiêng*, `mã`
 * - Danh sách "- " / "* " / "1. "
 * - Tiêu đề "#": hiển thị đậm
 * - Xuống dòng giữ nguyên
 * Không hỗ trợ HTML/link thô để tránh XSS; link dạng [text](url) chỉ mở http(s).
 */
const INLINE_RE = /(\*\*[^*]+\*\*|\*[^*\n]+\*|`[^`\n]+`|\[[^\]\n]+\]\(https?:\/\/[^\s)]+\))/g;

function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const parts = text.split(INLINE_RE).filter((p) => p !== '');
  return parts.map((p, i) => {
    const key = `${keyPrefix}-${i}`;
    if (p.startsWith('**') && p.endsWith('**')) return <strong key={key}>{p.slice(2, -2)}</strong>;
    if (p.startsWith('`') && p.endsWith('`')) {
      return (
        <code key={key} style={{ background: '#F1F0EC', padding: '0 4px', borderRadius: 4, fontSize: '0.92em' }}>
          {p.slice(1, -1)}
        </code>
      );
    }
    if (p.startsWith('*') && p.endsWith('*') && p.length > 2) return <em key={key}>{p.slice(1, -1)}</em>;
    const link = p.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
    if (link) {
      return (
        <a key={key} href={link[2]} target="_blank" rel="noopener noreferrer">
          {link[1]}
        </a>
      );
    }
    return <React.Fragment key={key}>{p}</React.Fragment>;
  });
}

export const LiteMarkdown: React.FC<{ text: string }> = ({ text }) => {
  const lines = (text || '').replace(/\r\n/g, '\n').split('\n');
  const out: React.ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const flushList = () => {
    if (!list) return;
    const Tag = list.ordered ? 'ol' : 'ul';
    out.push(
      <Tag key={`l-${out.length}`} style={{ margin: '4px 0 6px', paddingLeft: 22 }}>
        {list.items.map((it, i) => (
          <li key={i} style={{ margin: '2px 0' }}>
            {renderInline(it, `li-${out.length}-${i}`)}
          </li>
        ))}
      </Tag>,
    );
    list = null;
  };

  lines.forEach((raw, idx) => {
    const line = raw.trimEnd();
    const ul = line.match(/^\s*[-*•]\s+(.*)$/);
    const ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (ul || ol) {
      const ordered = Boolean(ol);
      if (!list || list.ordered !== ordered) {
        flushList();
        list = { ordered, items: [] };
      }
      list.items.push((ul || ol)![1]);
      return;
    }
    flushList();
    if (line.trim() === '') {
      out.push(<div key={`br-${idx}`} style={{ height: 6 }} />);
      return;
    }
    const heading = line.match(/^#{1,6}\s+(.*)$/);
    if (heading) {
      out.push(
        <div key={`h-${idx}`} style={{ fontWeight: 600, margin: '4px 0' }}>
          {renderInline(heading[1], `h-${idx}`)}
        </div>,
      );
      return;
    }
    out.push(<div key={`p-${idx}`}>{renderInline(line, `p-${idx}`)}</div>);
  });
  flushList();

  return <>{out}</>;
};

export default LiteMarkdown;
