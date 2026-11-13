export interface MockCommentItem {
  id: string;
  targetType: string;
  targetId: string;
  parentCommentId: string | null;
  isDeleted: boolean;
  content: string;
  stickerItemId: string | null;
  sticker: any | null;
  attachedAssetId: string | null;
  attachedImageUrl: string | null;
  moderationStatus: 'APPROVED' | 'PENDING' | 'REJECTED';
  isPendingMine: boolean;
  author: {
    id: string;
    username: string;
    displayName: string;
    avatarAssetId: string | null;
    avatarUrl: string;
    isLocked?: boolean;
  };
  createdAt: string;
}

export interface MockPostItem {
  id: string;
  slug: string;
  title: string;
  summary: string;
  content: string;
  contentBlocks: any[];
  coverAssetId: string | null;
  coverUrl: string | null;
  photos: any[];
  tags: string[];
  createdAt: string;
  author: {
    id: string;
    username: string;
    displayName: string;
    avatarAssetId: string | null;
    avatarUrl: string;
    isLocked?: boolean;
  };
  place?: any;
  currentPublishedRevision?: any;
}

export const MOCK_COMMENTS: MockCommentItem[] = [
  {
    id: 'comm-1',
    targetType: 'PLACE',
    targetId: 'd3b07384-d113-4940-b333-311211111111',
    parentCommentId: null,
    isDeleted: false,
    content: 'Quán có chỗ để xe máy an toàn và miễn phí cho sinh viên không bạn ơi?',
    stickerItemId: null,
    sticker: null,
    attachedAssetId: null,
    attachedImageUrl: null,
    moderationStatus: 'APPROVED',
    isPendingMine: false,
    author: {
      id: 'u-std-1',
      username: 'sinhvien_bk',
      displayName: 'Nguyễn Văn An (K21 KHMT Bách Khoa)',
      avatarAssetId: null,
      avatarUrl: 'https://api.dicebear.com/7.x/bottts/svg?seed=sinhvien_bk',
      isLocked: false,
    },
    createdAt: '2026-09-21T09:00:00Z',
  },
  {
    id: 'comm-2',
    targetType: 'PLACE',
    targetId: 'd3b07384-d113-4940-b333-311211111111',
    parentCommentId: 'comm-1',
    isDeleted: false,
    content: 'Có nha bạn ơi! Quán có bãi xe ngay trước cửa, bảo vệ dắt xe và phát vé miễn phí 24/24 luôn nhé.',
    stickerItemId: null,
    sticker: null,
    attachedAssetId: null,
    attachedImageUrl: null,
    moderationStatus: 'APPROVED',
    isPendingMine: false,
    author: {
      id: 'u-admin-1',
      username: 'admin',
      displayName: 'Quản trị viên Hệ thống',
      avatarAssetId: null,
      avatarUrl: 'https://api.dicebear.com/7.x/bottts/svg?seed=admin',
      isLocked: false,
    },
    createdAt: '2026-09-21T09:30:00Z',
  },
  {
    id: 'comm-3',
    targetType: 'PLACE',
    targetId: 'd3b07384-d113-4940-b333-311211111111',
    parentCommentId: null,
    isDeleted: false,
    content: 'Tầng 1 Silent Zone có cần đặt bàn trước vào mùa thi không ạ?',
    stickerItemId: null,
    sticker: null,
    attachedAssetId: null,
    attachedImageUrl: null,
    moderationStatus: 'APPROVED',
    isPendingMine: false,
    author: {
      id: 'u-std-2',
      username: 'linhchi_ueh',
      displayName: 'Trần Thị Linh Chi (UEH)',
      avatarAssetId: null,
      avatarUrl: 'https://api.dicebear.com/7.x/bottts/svg?seed=linhchi_ueh',
      isLocked: false,
    },
    createdAt: '2026-09-22T14:15:00Z',
  },
];

export const MOCK_POSTS: MockPostItem[] = [
  {
    id: 'post-1',
    slug: 'review-the-study-hub-goc-hoc-bai-sinh-vien-bach-khoa',
    title: 'Trải nghiệm không gian học bài xuyên đêm tại The Study Hub',
    summary: 'Chia sẻ thực tế về tốc độ Wi-Fi, mật độ ổ cắm và sự yên tĩnh tại cơ sở Tô Hiến Thành Quận 10.',
    content:
      'The Study Hub là địa điểm cứu cánh thực sự cho mùa đồ án tốt nghiệp của sinh viên Bách Khoa và các trường lân cận. Tầng trệt không gian mở trao đổi nhóm rất thoải mái, tầng 1 im lặng tuyệt đối không tiếng ồn. Trà sữa và cà phê rang xay nguyên chất giá từ 29k rất hợp túi tiền sinh viên.',
    contentBlocks: [
      {
        type: 'text',
        content:
          'The Study Hub là địa điểm cứu cánh thực sự cho mùa đồ án tốt nghiệp của sinh viên Bách Khoa và các trường lân cận. Tầng trệt không gian mở trao đổi nhóm rất thoải mái, tầng 1 im lặng tuyệt đối không tiếng ồn. Trà sữa và cà phê rang xay nguyên chất giá từ 29k rất hợp túi tiền sinh viên.',
      },
    ],
    coverAssetId: '11111111-1111-4111-8111-111111111111',
    coverUrl: 'https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&w=1200&q=80',
    photos: [
      {
        assetId: '11111111-1111-4111-8111-111111111111',
        url: 'https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&w=400&q=80',
        fullUrl: 'https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&w=1200&q=80',
      },
    ],
    tags: ['học bài', '24/7', 'bách khoa'],
    createdAt: '2026-09-20T10:00:00Z',
    author: {
      id: 'u-std-1',
      username: 'sinhvien_bk',
      displayName: 'Nguyễn Văn An (K21 KHMT Bách Khoa)',
      avatarAssetId: null,
      avatarUrl: 'https://api.dicebear.com/7.x/bottts/svg?seed=sinhvien_bk',
      isLocked: false,
    },
    place: {
      slug: 'the-study-hub-ca-phe-hoc-bai-24-7',
      name: 'The Study Hub - Cà Phê Học Bài & Co-Working 24/7',
      address: '142 Tô Hiến Thành, Phường 14, Quận 10, TP.HCM',
    },
    currentPublishedRevision: {
      title: 'Trải nghiệm không gian học bài xuyên đêm tại The Study Hub',
      content:
        'The Study Hub là địa điểm cứu cánh thực sự cho mùa đồ án tốt nghiệp của sinh viên Bách Khoa và các trường lân cận.',
    },
  },
];
