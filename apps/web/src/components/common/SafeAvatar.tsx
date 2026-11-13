import React, { useState } from 'react';
import { Avatar } from 'antd';
import type { AvatarProps } from 'antd';
import { User } from 'lucide-react';

/** Những URL ảnh đã lỗi (403/404) — nhớ lại để không thử tải lại lần nữa trong cả phiên. */
const failedSrc = new Set<string>();

/**
 * Ảnh đại diện an toàn: ảnh lỗi (chưa duyệt / đã gỡ) thì rơi về chữ cái đầu, KHÔNG thử tải lại.
 * antd Avatar khi ảnh lỗi sẽ đổi state rồi vẽ lại thẻ <img> cũ -> tạo vòng lặp hàng trăm request/phút,
 * đủ để đốt hạn mức chung và cả site nhận "Bạn đã gửi quá nhiều yêu cầu".
 */
export const SafeAvatar: React.FC<AvatarProps & { src?: string | null; name?: string | null }> = ({ src, name, icon, children, ...rest }) => {
  const [broken, setBroken] = useState(() => Boolean(src && failedSrc.has(src)));
  const usable = src && !broken ? src : undefined;
  const letter = (name || '').trim().charAt(0).toUpperCase();

  return (
    <Avatar
      {...rest}
      src={
        usable ? (
          <img
            src={usable}
            alt={name || ''}
            onError={() => {
              failedSrc.add(usable);
              setBroken(true);
            }}
          />
        ) : undefined
      }
      icon={!usable && !letter ? icon ?? <User size="1em" /> : undefined}
    >
      {!usable && letter ? letter : children}
    </Avatar>
  );
};

export default SafeAvatar;
