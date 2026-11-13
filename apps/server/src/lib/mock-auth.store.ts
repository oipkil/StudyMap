export interface MockUserProfile {
  displayName: string;
  currentPublishedAvatarAssetId: string | null;
  currentPublishedBio: string | null;
}

export interface MockUser {
  id: string;
  email: string;
  username: string;
  role: 'ADMIN' | 'USER' | 'MODERATOR';
  isEmailVerified: boolean;
  isLocked: boolean;
  aiPrivacyConsentAccepted: boolean;
  profile: MockUserProfile;
  createdAt: Date;
}

export const MOCK_USERS: MockUser[] = [
  {
    id: 'u-admin-1',
    email: 'admin@ssg.vn',
    username: 'admin',
    role: 'ADMIN',
    isEmailVerified: true,
    isLocked: false,
    aiPrivacyConsentAccepted: true,
    profile: {
      displayName: 'Quản trị viên Hệ thống',
      currentPublishedAvatarAssetId: null,
      currentPublishedBio: 'Admin điều hành nền tảng StudyMap / SSG',
    },
    createdAt: new Date('2026-01-01T00:00:00Z'),
  },
  {
    id: 'u-std-1',
    email: 'student@ssg.vn',
    username: 'sinhvien_bk',
    role: 'USER',
    isEmailVerified: true,
    isLocked: false,
    aiPrivacyConsentAccepted: true,
    profile: {
      displayName: 'Nguyễn Văn An (K21 KHMT Bách Khoa)',
      currentPublishedAvatarAssetId: null,
      currentPublishedBio: 'Đam mê lập trình & săn quán cà phê học bài 24/7',
    },
    createdAt: new Date('2026-02-01T00:00:00Z'),
  },
  {
    id: 'u-std-2',
    email: 'linhchi@ssg.vn',
    username: 'linhchi_ueh',
    role: 'USER',
    isEmailVerified: true,
    isLocked: false,
    aiPrivacyConsentAccepted: true,
    profile: {
      displayName: 'Trần Thị Linh Chi (UEH)',
      currentPublishedAvatarAssetId: null,
      currentPublishedBio: 'Reviewer cà phê học tập & chill cuối tuần',
    },
    createdAt: new Date('2026-02-15T00:00:00Z'),
  },
  {
    id: 'u-std-spam',
    email: 'spammer@spam.com',
    username: 'spammer_quangcao',
    role: 'USER',
    isEmailVerified: true,
    isLocked: false,
    aiPrivacyConsentAccepted: false,
    profile: {
      displayName: 'Tài khoản Spam Quảng cáo',
      currentPublishedAvatarAssetId: null,
      currentPublishedBio: 'Chuyên gửi tin rác',
    },
    createdAt: new Date('2026-03-01T00:00:00Z'),
  },
];

export const MOCK_SESSIONS = new Map<string, { user: MockUser; expiresAt: Date }>();

// Pre-populate standard tokens so developer can test without logging in
const DEFAULT_ADMIN_TOKEN = 'mock-admin-token-2026';
const DEFAULT_USER_TOKEN = 'mock-user-token-2026';

MOCK_SESSIONS.set(DEFAULT_ADMIN_TOKEN, {
  user: MOCK_USERS[0],
  expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
});

MOCK_SESSIONS.set(DEFAULT_USER_TOKEN, {
  user: MOCK_USERS[1],
  expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
});

export function findMockUserByIdentifier(identifier: string): MockUser | undefined {
  const norm = identifier.toLowerCase().trim();
  return MOCK_USERS.find((u) => u.email.toLowerCase() === norm || u.username.toLowerCase() === norm);
}

export function findMockUserById(id: string): MockUser | undefined {
  return MOCK_USERS.find((u) => u.id === id);
}

export function setMockUserLocked(id: string, isLocked: boolean): MockUser | undefined {
  const user = findMockUserById(id);
  if (user) {
    user.isLocked = isLocked;
  }
  return user;
}
