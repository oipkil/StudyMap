/**
 * Tien ich chuan hoa va xu ly van ban tieng Viet
 */

export function removeAccents(str: string): string {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

export function matchesVietnameseSearch(sourceText: string, searchQuery: string): boolean {
  if (!searchQuery) return true;
  if (!sourceText) return false;

  const normalizedSource = removeAccents(sourceText);
  const normalizedQuery = removeAccents(searchQuery);

  return normalizedSource.includes(normalizedQuery);
}

export function sanitizeHtml(raw: string): string {
  if (!raw) return '';
  let sanitized = raw
    // Strip dangerous tags completely
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '')
    .replace(/<embed\b[^<]*(?:(?!<\/embed>)<[^<]*)*<\/embed>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    // Strip inline event handlers (onload, onclick, onerror, etc.)
    .replace(/on\w+\s*=\s*(['"]).*?\1/gi, '')
    .replace(/on\w+\s*=\s*[^ >]+/gi, '')
    // Strip dangerous pseudo-protocols in href/src
    .replace(/(href|src)\s*=\s*(['"])\s*(?:javascript|data|vbscript):.*?\2/gi, '$1="#"')
    .replace(/javascript:[^"'>\s]*/gi, '');

  // Ensure external links have rel="noopener noreferrer" and target="_blank"
  sanitized = sanitized.replace(/<a\b([^>]*)>/gi, (_match, attrs) => {
    let newAttrs = attrs;
    if (!/target\s*=/i.test(newAttrs)) {
      newAttrs += ' target="_blank"';
    }
    if (!/rel\s*=/i.test(newAttrs)) {
      newAttrs += ' rel="noopener noreferrer"';
    } else {
      newAttrs = newAttrs.replace(/rel=(['"])(.*?)\1/i, 'rel="noopener noreferrer $2"');
    }
    return `<a${newAttrs}>`;
  });

  return sanitized;
}

