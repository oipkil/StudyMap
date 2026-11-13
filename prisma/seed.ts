import { PrismaClient, Role, OperationalStatus, PublicationStatus, ModerationStatus, ContentState, AIProviderType, AITaskType, DataType } from '@prisma/client';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';

const prisma = new PrismaClient();

// Helper mã hóa AES-256-GCM cho seed
function encryptSeedSecret(plaintext: string, masterKeyHex: string) {
  const key = Buffer.from(masterKeyHex, 'hex');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let ciphertext = cipher.update(plaintext, 'utf8', 'hex');
  ciphertext += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return {
    ciphertext,
    iv: iv.toString('hex'),
    authTag,
  };
}

async function main() {
  console.log('🌱 Bắt đầu gieo dữ liệu mẫu (Seeding SSG Database)...');

  // Xóa sạch dữ liệu cũ theo thứ tự quan hệ để seed sạch
  await prisma.$transaction([
    prisma.auditLog.deleteMany(),
    prisma.outboxEvent.deleteMany(),
    prisma.announcementDismissal.deleteMany(),
    prisma.announcement.deleteMany(),
    prisma.notification.deleteMany(),
    prisma.supportCase.deleteMany(),
    prisma.aIAttempt.deleteMany(),
    prisma.aIMessage.deleteMany(),
    prisma.aIConversation.deleteMany(),
    prisma.aITaskConfigVersion.deleteMany(),
    prisma.aITaskConfig.deleteMany(),
    prisma.aIModelConfig.deleteMany(),
    prisma.aIProviderConfig.deleteMany(),
    prisma.aIUsageBudget.deleteMany(),
    prisma.collectionItem.deleteMany(),
    prisma.collectionRevision.deleteMany(),
    prisma.collection.deleteMany(),
    prisma.placeFavorite.deleteMany(),
    prisma.helpfulVote.deleteMany(),
    prisma.commentRevision.deleteMany(),
    prisma.comment.deleteMany(),
    prisma.reviewRevision.deleteMany(),
    prisma.review.deleteMany(),
    prisma.reviewCriteria.deleteMany(),
    prisma.report.deleteMany(),
    prisma.placeChangeRequest.deleteMany(),
    prisma.surveyRequest.deleteMany(),
    prisma.placeSuggestion.deleteMany(),
    prisma.placePublishedProjection.deleteMany(),
    prisma.place.updateMany({ data: { currentPublishedRevisionId: null } }),
    prisma.placeRevision.deleteMany(),
    prisma.place.deleteMany(),
    prisma.categoryFieldBinding.deleteMany(),
    prisma.fieldDefinitionVersion.deleteMany(),
    prisma.fieldDefinition.deleteMany(),
    prisma.fieldGroup.deleteMany(),
    prisma.stickerItem.deleteMany(),
    prisma.stickerPack.deleteMany(),
    prisma.assetUsage.deleteMany(),
    prisma.assetVariant.deleteMany(),
    prisma.assetRevision.deleteMany(),
    prisma.asset.deleteMany(),
    prisma.userProfileRevision.deleteMany(),
    prisma.userProfile.deleteMany(),
    prisma.session.deleteMany(),
    prisma.authToken.deleteMany(),
    prisma.roleAuditLog.deleteMany(),
    prisma.user.deleteMany(),
    prisma.campus.deleteMany(),
    prisma.region.deleteMany(),
    prisma.brand.deleteMany(),
    prisma.category.deleteMany(),
  ]);

  const masterKey = process.env.ENCRYPTION_MASTER_KEY || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

  // 1. Regions
  const regionHcm = await prisma.region.create({
    data: {
      code: 'VN-SG',
      name: 'Thành phố Hồ Chí Minh',
    },
  });

  // 2. Campuses
  const campusKhtnCs1 = await prisma.campus.create({
    data: {
      name: 'ĐH Khoa học Tự nhiên - Cơ sở 1',
      universityName: 'ĐHQG-HCM',
      latitude: 10.762913,
      longitude: 106.682171,
      address: '227 Nguyễn Văn Cừ, Phường 4, Quận 5, TP.HCM',
      regionId: regionHcm.id,
    },
  });

  const campusKhtnCs2 = await prisma.campus.create({
    data: {
      name: 'ĐH Khoa học Tự nhiên - Cơ sở 2',
      universityName: 'ĐHQG-HCM',
      latitude: 10.875583,
      longitude: 106.798194,
      address: 'Khu phố 6, Phường Linh Trung, TP. Thủ Đức, TP.HCM',
      regionId: regionHcm.id,
    },
  });

  // 3. Categories
  const catCafe = await prisma.category.create({
    data: {
      slug: 'study-cafe',
      name: 'Café Học Bài',
      icon: 'CoffeeOutlined',
      description: 'Không gian yên tĩnh, bàn rộng, ổ cắm nhiều, Wi-Fi mạnh cho sinh viên làm việc và học tập.',
      sortOrder: 1,
    },
  });

  const catFood = await prisma.category.create({
    data: {
      slug: 'food-stall',
      name: 'Quán Ăn Sinh Viên',
      icon: 'ShopOutlined',
      description: 'Quán ăn ngon, bổ, giá cả hợp lý gần các cổng trường đại học.',
      sortOrder: 2,
    },
  });

  const catCoworking = await prisma.category.create({
    data: {
      slug: 'coworking-library',
      name: 'Không Gian Học & Thư Viện',
      icon: 'BookOutlined',
      description: 'Thư viện mở, phòng tự học và coworking space hỗ trợ họp nhóm chuyên sâu.',
      sortOrder: 3,
    },
  });

  // 4. Review Criteria cho Café Học Bài
  const criteriaWifi = await prisma.reviewCriteria.create({
    data: {
      categoryId: catCafe.id,
      code: 'wifi_quality',
      label: 'Chất Lượng Wi-Fi',
      description: 'Tốc độ tải, độ ổn định khi nhiều người cùng kết nối',
      sortOrder: 1,
    },
  });

  const criteriaSocket = await prisma.reviewCriteria.create({
    data: {
      categoryId: catCafe.id,
      code: 'socket_density',
      label: 'Mật Độ Ổ Cắm Điện',
      description: 'Số lượng ổ cắm tại bàn, độ tiện lợi cắm sạc laptop',
      sortOrder: 2,
    },
  });

  const criteriaSpace = await prisma.reviewCriteria.create({
    data: {
      categoryId: catCafe.id,
      code: 'study_space',
      label: 'Không Gian & Bàn Ghế',
      description: 'Độ cao bàn, ghế ngồi êm ái khi ngồi lâu, ánh sáng đủ sáng',
      sortOrder: 3,
    },
  });

  const criteriaNoise = await prisma.reviewCriteria.create({
    data: {
      categoryId: catCafe.id,
      code: 'quiet_level',
      label: 'Độ Yên Tĩnh',
      description: 'Âm nhạc nhỏ nhẹ, không bị ồn ào ảnh hưởng tập trung',
      sortOrder: 4,
    },
  });

  // 5. Users
  const adminPasswordHash = await bcrypt.hash('Admin@123456', 10);
  const studentPasswordHash = await bcrypt.hash('Student@123456', 10);

  const adminUser = await prisma.user.create({
    data: {
      email: 'admin@ssg.edu.vn',
      username: 'ssg_admin',
      passwordHash: adminPasswordHash,
      role: Role.ADMIN,
      isEmailVerified: true,
      profile: {
        create: {
          displayName: 'Quản Trị Viên SSG',
          currentPublishedBio: 'Hệ thống Khám phá Địa điểm & Quán Sinh Viên HCMUS.',
          isUniversityPublic: true,
        },
      },
    },
  });

  const student1 = await prisma.user.create({
    data: {
      email: 'sinhvien1@hcmus.edu.vn',
      username: 'an_nguyen_khtn',
      passwordHash: studentPasswordHash,
      role: Role.USER,
      isEmailVerified: true,
      profile: {
        create: {
          displayName: 'Nguyễn Văn An',
          currentPublishedBio: 'Sinh viên năm 3 Khoa Công nghệ Thông tin HCMUS.',
          universityCampusId: campusKhtnCs1.id,
          isUniversityPublic: true,
        },
      },
    },
  });

  const student2 = await prisma.user.create({
    data: {
      email: 'sinhvien2@hcmus.edu.vn',
      username: 'bao_tran_khtn',
      passwordHash: studentPasswordHash,
      role: Role.USER,
      isEmailVerified: true,
      profile: {
        create: {
          displayName: 'Trần Gia Bảo',
          currentPublishedBio: 'Đam mê cà phê học bài đêm và không gian yên tĩnh.',
          universityCampusId: campusKhtnCs1.id,
          isUniversityPublic: true,
        },
      },
    },
  });

  // 6. Dynamic Field Group & Definitions (TABLE & REPEATER)
  const fgStudy = await prisma.fieldGroup.create({
    data: {
      key: 'study_facilities',
      label: 'Không Gian & Phòng Học Nhóm',
      icon: 'TeamOutlined',
      sortOrder: 1,
    },
  });

  // Field REPEATER: Các phòng học chuyên dụng
  const fieldStudyRooms = await prisma.fieldDefinition.create({
    data: {
      key: 'study_rooms_list',
      label: 'Danh Sách Phòng Học Chuyên Dụng',
      description: 'Các phòng họp nhóm, phòng riêng có thể đặt trước với sức chứa và giá giờ.',
      dataType: DataType.REPEATER,
      fieldGroupId: fgStudy.id,
      isFilterable: true,
      isComparable: true,
      isPublic: true,
      currentVersion: 1,
      versions: {
        create: {
          version: 1,
          label: 'Danh Sách Phòng Học Chuyên Dụng',
          dataType: DataType.REPEATER,
          repeaterConfig: {
            minItems: 0,
            maxItems: 15,
            subFields: [
              { key: 'room_name', label: 'Tên phòng', type: 'TEXT', required: true },
              { key: 'capacity', label: 'Sức chứa', type: 'NUMBER', unit: 'người', isFilterable: true, isComparable: true },
              { key: 'price_per_hour', label: 'Giá thuê mỗi giờ', type: 'CURRENCY', unit: 'VND', isFilterable: true, isComparable: true },
              { key: 'has_whiteboard', label: 'Có bảng viết', type: 'BOOLEAN_TRI_STATE' },
            ],
          },
        },
      },
    },
  });

  // Gán field REPEATER cho danh mục Café học bài
  await prisma.categoryFieldBinding.create({
    data: {
      categoryId: catCafe.id,
      fieldDefinitionId: fieldStudyRooms.id,
    },
  });

  // 7. Tạo Quán 1: The Coffee House Nguyễn Văn Cừ
  const place1Snapshot = {
    name: 'The Coffee House - Nguyễn Văn Cừ',
    alternateNames: ['Nhà Cà Phê NVC', 'TCH Nguyễn Văn Cừ'],
    slug: 'the-coffee-house-nguyen-van-cu',
    categoryId: catCafe.id,
    operationalStatus: OperationalStatus.OPERATING,
    shortDescription: 'Không gian 2 tầng thoáng mát, đối diện Đại học Khoa học Tự nhiên CS1.',
    fullDescription: 'The Coffee House Nguyễn Văn Cừ là địa điểm quen thuộc của sinh viên KHTN và Sư Phạm. Quán có tầng lửng yên tĩnh thích hợp học tập cá nhân, tầng trệt có bàn dài họp nhóm.',
    address: '249 Nguyễn Văn Cừ, Phường 4, Quận 5, TP.HCM',
    latitude: 10.763421,
    longitude: 106.681954,
    nearestCampusId: campusKhtnCs1.id,
    distanceToCampusMeters: 60,
    timezone: 'Asia/Ho_Chi_Minh',
    weeklySchedule: [
      {
        dayOfWeek: 1,
        shifts: [{ shiftName: 'Cả ngày', openTime: '07:00', closeTime: '22:30', isOvernight: false }],
      },
      {
        dayOfWeek: 2,
        shifts: [{ shiftName: 'Cả ngày', openTime: '07:00', closeTime: '22:30', isOvernight: false }],
      },
      {
        dayOfWeek: 3,
        shifts: [{ shiftName: 'Cả ngày', openTime: '07:00', closeTime: '22:30', isOvernight: false }],
      },
      {
        dayOfWeek: 4,
        shifts: [{ shiftName: 'Cả ngày', openTime: '07:00', closeTime: '22:30', isOvernight: false }],
      },
      {
        dayOfWeek: 5,
        shifts: [{ shiftName: 'Cả ngày', openTime: '07:00', closeTime: '22:30', isOvernight: false }],
      },
      {
        dayOfWeek: 6,
        shifts: [{ shiftName: 'Cả ngày', openTime: '07:00', closeTime: '22:30', isOvernight: false }],
      },
      {
        dayOfWeek: 0,
        shifts: [{ shiftName: 'Cả ngày', openTime: '07:00', closeTime: '22:30', isOvernight: false }],
      },
    ],
    priceMin: 35000,
    priceMax: 65000,
    currency: 'VND',
    studentDiscountDetails: 'Giảm 10% khi tích điểm thành viên ứng dụng',
    amenities: {
      wifiQuality: 'STRONG',
      socketDensity: 'MANY',
      noiseLevel: 'MODERATE',
      studySuitability: 'EXCELLENT',
      groupStudyAllowed: true,
      privateRoomsCount: 1,
      airConditioned: true,
      petFriendly: false,
      motorcycleParking: 'FREE',
    },
    menuGroups: [
      {
        name: 'Cà phê truyền thống',
        sortOrder: 1,
        items: [
          {
            name: 'Cà phê sữa đá',
            basePrice: 35000,
            unit: 'VND',
            variants: [
              { name: 'Size M', price: 35000, isDefault: true },
              { name: 'Size L', price: 45000, isDefault: false },
            ],
          },
        ],
      },
      {
        name: 'Trà & Trái cây',
        sortOrder: 2,
        items: [
          {
            name: 'Trà đào cam sả',
            basePrice: 49000,
            unit: 'VND',
            variants: [
              { name: 'Size M', price: 49000, isDefault: true },
              { name: 'Size L', price: 59000, isDefault: false },
            ],
          },
        ],
      },
    ],
    dynamicFieldValues: [
      {
        fieldKey: 'study_rooms_list',
        dataType: 'REPEATER',
        value: [
          { room_name: 'Phòng Họp Nhóm Tầng 2', capacity: 8, price_per_hour: 80000, has_whiteboard: true },
        ],
      },
    ],
  };

  const place1 = await prisma.place.create({
    data: {
      slug: 'the-coffee-house-nguyen-van-cu',
      defaultName: 'The Coffee House - Nguyễn Văn Cừ',
      categoryId: catCafe.id,
      operationalStatus: OperationalStatus.OPERATING,
      publicationStatus: PublicationStatus.PUBLISHED,
      createdByUserId: adminUser.id,
    },
  });

  const place1Revision = await prisma.placeRevision.create({
    data: {
      placeId: place1.id,
      revisionNumber: 1,
      snapshotData: place1Snapshot,
      authorUserId: adminUser.id,
      moderationStatus: ModerationStatus.APPROVED,
      reviewerAdminId: adminUser.id,
      approvedAt: new Date(),
    },
  });

  await prisma.place.update({
    where: { id: place1.id },
    data: { currentPublishedRevisionId: place1Revision.id },
  });

  await prisma.placePublishedProjection.create({
    data: {
      placeId: place1.id,
      publishedRevisionId: place1Revision.id,
      name: place1Snapshot.name,
      alternateNames: place1Snapshot.alternateNames,
      slug: place1Snapshot.slug,
      categoryId: catCafe.id,
      campusId: campusKhtnCs1.id,
      latitude: place1Snapshot.latitude,
      longitude: place1Snapshot.longitude,
      priceMin: place1Snapshot.priceMin,
      priceMax: place1Snapshot.priceMax,
      ratingOverall: 4.8,
      reviewCount: 1,
      filterableAttributes: {
        wifi: 'STRONG',
        study_rooms_list: place1Snapshot.dynamicFieldValues[0].value,
      },
    },
  });

  // 8. Tạo Quán 2: Cà Phê Học Bài Đêm Cú Đêm 24/7 (Phục vụ test lọc Repeater Co-location & Giờ xuyên đêm)
  const place2Snapshot = {
    name: 'Cà Phê Học Bài Cú Đêm 24/7',
    alternateNames: ['Cú Đêm KHTN', 'Night Owl Cafe'],
    slug: 'ca-phe-hoc-bai-cu-dem-24-7',
    categoryId: catCafe.id,
    operationalStatus: OperationalStatus.OPERATING,
    shortDescription: 'Mở thâu đêm suốt sáng, không gian chuyên biệt cho ôn thi nước rút.',
    address: '183 Trần Bình Trọng, Phường 3, Quận 5, TP.HCM',
    latitude: 10.760112,
    longitude: 106.683452,
    nearestCampusId: campusKhtnCs1.id,
    distanceToCampusMeters: 300,
    timezone: 'Asia/Ho_Chi_Minh',
    weeklySchedule: [
      {
        dayOfWeek: 1,
        shifts: [{ shiftName: 'Ca Đêm Xuyên Sáng', openTime: '20:00', closeTime: '06:00', isOvernight: true }],
      },
      {
        dayOfWeek: 2,
        shifts: [{ shiftName: 'Ca Đêm Xuyên Sáng', openTime: '20:00', closeTime: '06:00', isOvernight: true }],
      },
      {
        dayOfWeek: 3,
        shifts: [{ shiftName: 'Ca Đêm Xuyên Sáng', openTime: '20:00', closeTime: '06:00', isOvernight: true }],
      },
      {
        dayOfWeek: 4,
        shifts: [{ shiftName: 'Ca Đêm Xuyên Sáng', openTime: '20:00', closeTime: '06:00', isOvernight: true }],
      },
      {
        dayOfWeek: 5,
        shifts: [{ shiftName: 'Ca Đêm Xuyên Sáng', openTime: '20:00', closeTime: '06:00', isOvernight: true }],
      },
      {
        dayOfWeek: 6,
        is24h: true,
        shifts: [],
      },
      {
        dayOfWeek: 0,
        is24h: true,
        shifts: [],
      },
    ],
    priceMin: 30000,
    priceMax: 50000,
    currency: 'VND',
    studentDiscountDetails: 'Giảm 15% khi xuất trình thẻ sinh viên HCMUS',
    amenities: {
      wifiQuality: 'STRONG',
      socketDensity: 'EVERY_TABLE',
      noiseLevel: 'SILENT',
      studySuitability: 'EXCELLENT',
      groupStudyAllowed: true,
      privateRoomsCount: 2,
      airConditioned: true,
      motorcycleParking: 'FREE',
    },
    dynamicFieldValues: [
      {
        fieldKey: 'study_rooms_list',
        dataType: 'REPEATER',
        value: [
          // Phòng A: Giá 50k, sức chứa 4
          { room_name: 'Phòng Tự Học A', capacity: 4, price_per_hour: 50000, has_whiteboard: true },
          // Phòng B: Giá 150k, sức chứa 12
          { room_name: 'Phòng Thuyết Trình B', capacity: 12, price_per_hour: 150000, has_whiteboard: true },
        ],
      },
    ],
  };

  const place2 = await prisma.place.create({
    data: {
      slug: 'ca-phe-hoc-bai-cu-dem-24-7',
      defaultName: 'Cà Phê Học Bài Cú Đêm 24/7',
      categoryId: catCafe.id,
      operationalStatus: OperationalStatus.OPERATING,
      publicationStatus: PublicationStatus.PUBLISHED,
      createdByUserId: adminUser.id,
    },
  });

  const place2Revision = await prisma.placeRevision.create({
    data: {
      placeId: place2.id,
      revisionNumber: 1,
      snapshotData: place2Snapshot,
      authorUserId: adminUser.id,
      moderationStatus: ModerationStatus.APPROVED,
      reviewerAdminId: adminUser.id,
      approvedAt: new Date(),
    },
  });

  await prisma.place.update({
    where: { id: place2.id },
    data: { currentPublishedRevisionId: place2Revision.id },
  });

  await prisma.placePublishedProjection.create({
    data: {
      placeId: place2.id,
      publishedRevisionId: place2Revision.id,
      name: place2Snapshot.name,
      alternateNames: place2Snapshot.alternateNames,
      slug: place2Snapshot.slug,
      categoryId: catCafe.id,
      campusId: campusKhtnCs1.id,
      latitude: place2Snapshot.latitude,
      longitude: place2Snapshot.longitude,
      priceMin: place2Snapshot.priceMin,
      priceMax: place2Snapshot.priceMax,
      is24h: false,
      ratingOverall: 4.5,
      reviewCount: 1,
      filterableAttributes: {
        wifi: 'STRONG',
        study_rooms_list: place2Snapshot.dynamicFieldValues[0].value,
      },
    },
  });

  // 9. Reviews
  const review1 = await prisma.review.create({
    data: {
      placeId: place1.id,
      userId: student1.id,
      ratingOverall: 5.0,
      state: ContentState.PUBLISHED,
    },
  });

  const review1Rev = await prisma.reviewRevision.create({
    data: {
      reviewId: review1.id,
      revisionNumber: 1,
      ratingOverall: 5,
      criteriaScores: [
        { criteriaId: criteriaWifi.id, score: 5 },
        { criteriaId: criteriaSocket.id, score: 5 },
        { criteriaId: criteriaSpace.id, score: 5 },
        { criteriaId: criteriaNoise.id, score: 4 },
      ],
      content: 'Quán rộng rãi, máy lạnh mát rượi, Wi-Fi tải tài liệu đồ án rất nhanh, nhân viên thân thiện với sinh viên.',
      visitDate: '2026-09-10',
      moderationStatus: ModerationStatus.APPROVED,
      reviewerAdminId: adminUser.id,
      approvedAt: new Date(),
    },
  });

  await prisma.review.update({
    where: { id: review1.id },
    data: { currentPublishedRevisionId: review1Rev.id },
  });

  // 10. Announcements
  await prisma.announcement.create({
    data: {
      title: 'Chào đón Tân Sinh Viên Khóa 2026!',
      content: 'Hệ thống SSG chính thức ra mắt giúp bạn tìm quán café học bài, quán ăn ngon và không gian tự học chuẩn sinh viên quanh khuôn viên trường.',
      level: 'SUCCESS',
      startAt: new Date(Date.now() - 86400000),
      endAt: new Date(Date.now() + 30 * 86400000),
      targetAudience: 'ALL',
      priority: 10,
      version: 1,
      isPublished: true,
    },
  });

  // 11. AI Provider mock (CHỈ cho test/E2E: SEED_MOCK_AI=true). Môi trường dev/prod: admin tự thêm provider thật ở /admin/ai.
  if (process.env.SEED_MOCK_AI === 'true') {
    // 11. AI Provider Config (AES-256 Encrypted)
    const encResult = encryptSeedSecret('sk-mock-ssg-development-key-2026', masterKey);
    const aiProvider = await prisma.aIProviderConfig.create({
      data: {
        name: 'OpenAI Mock Gateway (Local/Test)',
        adapterType: AIProviderType.OPENAI_COMPATIBLE,
        baseUrl: 'http://localhost:4000/api/v1/mock/ai',
        encryptedApiKey: encResult.ciphertext,
        iv: encResult.iv,
        authTag: encResult.authTag,
        isEnabled: true,
        isDefault: true,
        sortOrder: 1,
      },
    });

    const aiModelGpt4o = await prisma.aIModelConfig.create({
      data: {
        providerId: aiProvider.id,
        modelId: 'gpt-4o',
        displayName: 'GPT-4o (Đa Năng)',
        maxTokens: 2048,
        contextWindow: 128000,
        supportsTools: true,
        supportsStreaming: true,
      },
    });

    const aiTaskChat = await prisma.aITaskConfig.create({
      data: {
        taskType: AITaskType.STUDENT_CHAT,
        activeModelId: aiModelGpt4o.id,
        systemPrompt: 'Bạn là Trợ lý AI Sinh Viên SSG, hỗ trợ tìm quán café học bài, chỗ học nhóm, quán ăn quanh trường dựa trên dữ liệu đã được kiểm duyệt công khai.',
        promptVersion: 1,
        maxPlacesInAnswer: 3,
        toolAllowlist: ['searchPlaces', 'getPublishedPlaceDetail', 'comparePlaces'],
      },
    });

    await prisma.aITaskConfigVersion.create({
      data: {
        taskConfigId: aiTaskChat.id,
        version: 1,
        modelId: aiModelGpt4o.modelId,
        systemPrompt: aiTaskChat.systemPrompt,
        toolAllowlist: aiTaskChat.toolAllowlist,
      },
    });
  } else {
    console.log('ℹ️  Bỏ qua provider AI mock (đặt SEED_MOCK_AI=true nếu cần cho test). Cấu hình AI thật tại /admin/ai.');
  }

  console.log('✅ Seed dữ liệu thành công!');
  console.log('🔑 Tài khoản Admin mẫu: admin@ssg.edu.vn / Admin@123456');
  console.log('🎓 Tài khoản Sinh viên mẫu: sinhvien1@hcmus.edu.vn / Student@123456');
  console.log('🏪 Quán mẫu có Repeater & Giờ đêm: "The Coffee House NVC" và "Cà Phê Cú Đêm 24/7"');
}

main()
  .catch((e) => {
    console.error('❌ Lỗi khi seed dữ liệu:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
