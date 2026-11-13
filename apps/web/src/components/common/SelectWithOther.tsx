import React, { useState } from 'react';
import { Select, Button, Divider } from 'antd';
import type { SelectProps } from 'antd';

/** Giá trị đặc biệt cho lựa chọn "khác" (tự ghi). Dùng chung cho hồ sơ, đề xuất quán... */
export const OTHER_VALUE = '__other__';

interface SelectWithOtherProps extends Omit<SelectProps, 'popupRender' | 'open' | 'onOpenChange' | 'virtual'> {
  /** Nhãn của mục "khác" trong danh sách (mặc định "Khác (tự ghi)") */
  otherLabel?: string;
  /** Chữ trên nút cố định cuối danh sách, luôn thấy dù đang cuộn/gõ tìm */
  otherButtonText?: string;
  /** data-testid cho nút "khác" */
  otherTestId?: string;
}

/**
 * Select có mục "khác": danh sách dài (17+ cơ sở) cuộn ảo sẽ giấu mục cuối/đầu khi đã có giá trị chọn sẵn,
 * nên đặt thêm nút cố định cuối bảng chọn — bấm là chọn "khác" ngay, không cần cuộn hay tìm.
 * Tắt cuộn ảo để mọi mục luôn có trong DOM (danh sách ngắn, không ảnh hưởng hiệu năng).
 */
export const SelectWithOther: React.FC<SelectWithOtherProps> = ({ options = [], otherLabel = 'Khác (tự ghi)', otherButtonText = 'Không có trong danh sách', otherTestId, onChange, value, ...rest }) => {
  const [open, setOpen] = useState(false);
  const pickOther = () => {
    onChange?.(OTHER_VALUE, { value: OTHER_VALUE, label: otherLabel });
    setOpen(false);
  };
  return (
    <Select
      {...rest}
      value={value}
      onChange={onChange}
      virtual={false}
      open={open}
      onOpenChange={setOpen}
      options={[{ value: OTHER_VALUE, label: otherLabel }, ...options]}
      popupRender={(menu) => (
        <>
          {menu}
          <Divider style={{ margin: '4px 0' }} />
          <Button type="link" block style={{ textAlign: 'left' }} data-testid={otherTestId} onMouseDown={(e) => e.preventDefault()} onClick={pickOther}>
            {otherButtonText}
          </Button>
        </>
      )}
    />
  );
};

export default SelectWithOther;
