import { PrismaClient, OperationalStatus, PublicationStatus, ModerationStatus, Role } from '@prisma/client';

const prisma = new PrismaClient();

async function run() {
  console.log('🔍 Kiểm tra dữ liệu nền...');

  // 1. Tìm hoặc tạo Category "Cà Phê Học Bài"
  let category = await prisma.category.findFirst({
    where: { OR: [{ slug: 'ca-phe' }, { slug: 'cafe' }, { name: { contains: 'Cà phê' } }] },
  });

  if (!category) {
    category = await prisma.category.findFirst();
  }

  if (!category) {
    category = await prisma.category.create({
      data: {
        slug: 'ca-phe-hoc-bai',
        name: 'Quán Cà Phê Học Bài',
        icon: 'CoffeeOutlined',
        description: 'Không gian cà phê yên tĩnh, nhiều ổ cắm, thích hợp học bài và làm việc',
        sortOrder: 1,
        isActive: true,
      },
    });
    console.log('✅ Đã tạo category mới:', category.name);
  } else {
    console.log('✅ Đã tìm thấy category:', category.name);
  }

  // 2. Tìm hoặc tạo Campus "ĐH Bách Khoa TP.HCM" hoặc "ĐH Khoa Học Tự Nhiên"
  let campus = await prisma.campus.findFirst({
    where: { OR: [{ name: { contains: 'Bách Khoa' } }, { name: { contains: 'Khoa học Tự nhiên' } }] },
  });

  if (!campus) {
    campus = await prisma.campus.findFirst();
  }

  if (!campus) {
    let region = await prisma.region.findFirst({ where: { code: 'VN-SG' } });
    if (!region) {
      region = await prisma.region.create({
        data: {
          code: 'VN-SG',
          name: 'Thành phố Hồ Chí Minh',
        },
      });
    }

    campus = await prisma.campus.create({
      data: {
        name: 'ĐH Bách Khoa TP.HCM - Cơ sở Lý Thường Kiệt',
        universityName: 'ĐHQG-HCM',
        latitude: 10.7721,
        longitude: 106.6578,
        address: '268 Lý Thường Kiệt, Phường 14, Quận 10, TP.HCM',
        regionId: region.id,
      },
    });
    console.log('✅ Đã tạo campus mới:', campus.name);
  } else {
    console.log('✅ Đã tìm thấy campus:', campus.name);
  }

  // 3. Tìm hoặc tạo Admin User
  let adminUser = await prisma.user.findFirst({
    where: { role: Role.ADMIN },
  });

  if (!adminUser) {
    adminUser = await prisma.user.findFirst();
  }

  if (!adminUser) {
    adminUser = await prisma.user.create({
      data: {
        email: 'studymap_admin@ssg.edu.vn',
        username: 'studymap_admin',
        passwordHash: '$2a$10$w0995mOqfQJtDsmE91e84u3mEvjR/d89qQW85rD0Q9V7h7.X731k.', // Admin@123456
        role: Role.ADMIN,
        isEmailVerified: true,
        profile: {
          create: {
            displayName: 'StudyMap Biên Tập Viên',
            currentPublishedBio: 'Chuyên gia thẩm định và giới thiệu các góc học bài chuẩn sinh viên.',
          },
        },
      },
    });
    console.log('✅ Đã tạo admin user mới:', adminUser.username);
  } else {
    console.log('✅ Đã tìm thấy admin user:', adminUser.username);
  }

  // 4. Tạo hoặc Cập nhật Quán cà phê ảo "The Study Hub - Cà Phê Học Bài & Co-Working 24/7"
  const slug = 'the-study-hub-ca-phe-hoc-bai-24-7';

  // Xóa quán cũ nếu đã tồn tại để tạo mới hoàn chỉnh
  const existingPlace = await prisma.place.findUnique({
    where: { slug },
  });

  if (existingPlace) {
    console.log('🗑️ Xóa phiên bản quán cũ để cập nhật mới...');
    await prisma.placePublishedProjection.deleteMany({ where: { placeId: existingPlace.id } });
    await prisma.place.update({ where: { id: existingPlace.id }, data: { currentPublishedRevisionId: null } });
    await prisma.placeRevision.deleteMany({ where: { placeId: existingPlace.id } });
    await prisma.place.delete({ where: { id: existingPlace.id } });
  }

  // 5. Chuẩn bị Snapshot dữ liệu chi tiết
  const demoSnapshot = {
    name: 'The Study Hub - Cà Phê Học Bài & Co-Working 24/7',
    alternateNames: ['StudyHub Q10', 'The Study Hub Bách Khoa', 'StudyHub Coffee & Work'],
    slug,
    categoryId: category.id,
    operationalStatus: OperationalStatus.OPERATING,
    shortDescription: 'Không gian học tập & cày deadline 24/7 đối diện ĐH Bách Khoa. Bàn cao công thái học, ổ cắm từng bàn, Wi-Fi 150Mbps.',
    fullDescription: `The Study Hub là không gian học tập và làm việc được thiết kế chuẩn mực dành riêng cho sinh viên đại học và người làm việc tự do:
- Tầng trệt: Khu vực cà phê năng động, bàn dài họp nhóm thảo luận dự án lớn, có bảng kính và máy chiếu.
- Tầng 1: Silent Study Zone (Khu tự học tĩnh lặng < 40dB) với vách ngăn chống xao nhãng, đèn bàn chống cận, ghế tựa êm lưng chống gù.
- Tầng 2: Hệ thống 3 phòng học nhóm cách âm chuyên biệt có máy chiếu và bảng từ viết bút lông.
- Đồ uống giá sinh viên chỉ từ 29.000đ, phục vụ nước lọc tự lấy mát lạnh miễn phí liên tục 24/24.`,
    address: '142 Tô Hiến Thành, Phường 14, Quận 10, TP.HCM',
    latitude: 10.7725,
    longitude: 106.6598,
    nearestCampusId: campus.id,
    distanceToCampusMeters: 180,
    timezone: 'Asia/Ho_Chi_Minh',
    weeklySchedule: [
      { dayOfWeek: 1, is24h: true, shifts: [] },
      { dayOfWeek: 2, is24h: true, shifts: [] },
      { dayOfWeek: 3, is24h: true, shifts: [] },
      { dayOfWeek: 4, is24h: true, shifts: [] },
      { dayOfWeek: 5, is24h: true, shifts: [] },
      { dayOfWeek: 6, is24h: true, shifts: [] },
      { dayOfWeek: 0, is24h: true, shifts: [] },
    ],
    priceMin: 29000,
    priceMax: 55000,
    currency: 'VND',
    studentDiscountDetails: 'Giảm 15% tổng hóa đơn khi xuất trình thẻ sinh viên (hoặc app VNeID) từ thứ 2 đến thứ 6.',
    amenities: {
      wifiQuality: 'STRONG',
      socketDensity: 'EVERY_TABLE',
      noiseLevel: 'QUIET',
      studySuitability: 'EXCELLENT',
      groupStudyAllowed: true,
      privateRoomsCount: 3,
      airConditioned: true,
      motorcycleParking: 'FREE',
      petFriendly: false,
      wifiPassword: 'studymap2026',
    },
    gallery: [
      {
        assetId: '11111111-1111-4111-8111-111111111111',
        isCover: true,
        caption: 'Góc học tập bàn dài laptop hiện đại, ánh sáng vàng dịu mắt',
        publicUrl: 'https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&w=1200&q=80',
        thumbUrl: 'https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&w=400&q=80',
        displayOrder: 1,
      },
      {
        assetId: '22222222-2222-4222-8222-222222222222',
        isCover: false,
        caption: 'Bàn ghế cao công thái học kèm ổ cắm điện từng bàn',
        publicUrl: 'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=1200&q=80',
        thumbUrl: 'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=400&q=80',
        displayOrder: 2,
      },
      {
        assetId: '33333333-3333-4333-8333-333333333333',
        isCover: false,
        caption: 'Menu nước uống sinh viên & bánh croissant thơm ngon',
        publicUrl: 'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?auto=format&fit=crop&w=1200&q=80',
        thumbUrl: 'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?auto=format&fit=crop&w=400&q=80',
        displayOrder: 3,
      },
      {
        assetId: '44444444-4444-4444-8444-444444444444',
        isCover: false,
        caption: 'Phòng học nhóm cách âm có bảng viết kính cho 6-8 người',
        publicUrl: 'https://images.unsplash.com/photo-1517502884422-41eaead166d4?auto=format&fit=crop&w=1200&q=80',
        thumbUrl: 'https://images.unsplash.com/photo-1517502884422-41eaead166d4?auto=format&fit=crop&w=400&q=80',
        displayOrder: 4,
      },
      {
        assetId: '55555555-5555-4555-8555-555555555555',
        isCover: false,
        caption: 'Quầy pha chế cà phê sạch và nước lọc tự phục vụ',
        publicUrl: 'https://images.unsplash.com/photo-1442512595331-e89e73853f31?auto=format&fit=crop&w=1200&q=80',
        thumbUrl: 'https://images.unsplash.com/photo-1442512595331-e89e73853f31?auto=format&fit=crop&w=400&q=80',
        displayOrder: 5,
      },
    ],
    dynamicFieldValues: [
      {
        fieldKey: 'study_rooms_list',
        dataType: 'REPEATER',
        value: [
          { room_name: 'Phòng Họp Focus A (6 người)', capacity: 6, price_per_hour: 50000, has_whiteboard: true },
          { room_name: 'Phòng Thuyết Trình B (12 người)', capacity: 12, price_per_hour: 100000, has_whiteboard: true },
        ],
      },
    ],
  };

  // 6. Tạo Place trong CSDL
  const newPlace = await prisma.place.create({
    data: {
      slug,
      defaultName: demoSnapshot.name,
      categoryId: category.id,
      operationalStatus: OperationalStatus.OPERATING,
      publicationStatus: PublicationStatus.PUBLISHED,
      createdByUserId: adminUser.id,
    },
  });

  // 7. Tạo PlaceRevision đã được duyệt
  const newRevision = await prisma.placeRevision.create({
    data: {
      placeId: newPlace.id,
      revisionNumber: 1,
      snapshotData: demoSnapshot,
      authorUserId: adminUser.id,
      moderationStatus: ModerationStatus.APPROVED,
      reviewerAdminId: adminUser.id,
      approvedAt: new Date(),
    },
  });

  // 8. Cập nhật currentPublishedRevisionId
  await prisma.place.update({
    where: { id: newPlace.id },
    data: { currentPublishedRevisionId: newRevision.id },
  });

  // 9. Tạo PlacePublishedProjection phục vụ Map, Discover & Filter
  await prisma.placePublishedProjection.create({
    data: {
      placeId: newPlace.id,
      publishedRevisionId: newRevision.id,
      name: demoSnapshot.name,
      alternateNames: demoSnapshot.alternateNames,
      slug: demoSnapshot.slug,
      categoryId: category.id,
      campusId: campus.id,
      latitude: demoSnapshot.latitude,
      longitude: demoSnapshot.longitude,
      priceMin: demoSnapshot.priceMin,
      priceMax: demoSnapshot.priceMax,
      is24h: true,
      ratingOverall: 4.9,
      reviewCount: 3,
      studyAmenities: {
        wifiQuality: 'STRONG',
        socketDensity: 'EVERY_TABLE',
        noiseLevel: 'QUIET',
        studySuitability: 'EXCELLENT',
        groupStudyAllowed: true,
      },
      filterableAttributes: {
        wifi: 'STRONG',
        socket: 'EVERY_TABLE',
        noise: 'QUIET',
        study_rooms_list: demoSnapshot.dynamicFieldValues[0].value,
      },
    },
  });

  console.log('🎉 ĐÃ TẠO THÀNH CÔNG QUÁN CÀ PHÊ HỌC BÀI MẪU:');
  console.log('📌 Tên quán:', demoSnapshot.name);
  console.log('📌 Slug:', slug);
  console.log('📌 Vị trí:', demoSnapshot.address);
  console.log('📌 Tọa độ:', demoSnapshot.latitude, demoSnapshot.longitude);
  console.log('📌 Giờ mở cửa: Mở cửa 24/24 xuyên đêm');
  console.log('📌 Tiện ích: Ổ cắm từng bàn, Wi-Fi 150Mbps, Giữ xe free, Ưu đãi SV 15%');
}

run()
  .catch((e) => {
    console.error('❌ Lỗi:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
