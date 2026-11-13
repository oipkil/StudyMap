export const Role = {
  USER: 'USER',
  ADMIN: 'ADMIN',
} as const;
export type Role = (typeof Role)[keyof typeof Role];

export const OperationalStatus = {
  OPERATING: 'OPERATING',
  TEMPORARILY_CLOSED: 'TEMPORARILY_CLOSED',
  PERMANENTLY_CLOSED: 'PERMANENTLY_CLOSED',
  UNKNOWN: 'UNKNOWN',
} as const;
export type OperationalStatus = (typeof OperationalStatus)[keyof typeof OperationalStatus];

export const PublicationStatus = {
  DRAFT: 'DRAFT',
  PENDING: 'PENDING',
  CHANGES_REQUESTED: 'CHANGES_REQUESTED',
  REJECTED: 'REJECTED',
  APPROVED: 'APPROVED',
  PUBLISHED: 'PUBLISHED',
  HIDDEN: 'HIDDEN',
  REVOKED: 'REVOKED',
  ARCHIVED: 'ARCHIVED',
  WITHDRAWN: 'WITHDRAWN',
} as const;
export type PublicationStatus = (typeof PublicationStatus)[keyof typeof PublicationStatus];

export const ModerationStatus = {
  PENDING: 'PENDING',
  CHANGES_REQUESTED: 'CHANGES_REQUESTED',
  REJECTED: 'REJECTED',
  APPROVED: 'APPROVED',
  REVOKED: 'REVOKED',
} as const;
export type ModerationStatus = (typeof ModerationStatus)[keyof typeof ModerationStatus];

export const TechnicalStatus = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  READY: 'READY',
  FAILED: 'FAILED',
} as const;
export type TechnicalStatus = (typeof TechnicalStatus)[keyof typeof TechnicalStatus];

export const TargetType = {
  PLACE: 'PLACE',
  REVIEW: 'REVIEW',
  COMMENT: 'COMMENT',
  POST: 'POST',
  ASSET: 'ASSET',
  USER: 'USER',
  STICKER_PACK: 'STICKER_PACK',
} as const;
export type TargetType = (typeof TargetType)[keyof typeof TargetType];

export const ReportStatus = {
  OPEN: 'OPEN',
  INVESTIGATING: 'INVESTIGATING',
  RESOLVED: 'RESOLVED',
  DISMISSED: 'DISMISSED',
} as const;
export type ReportStatus = (typeof ReportStatus)[keyof typeof ReportStatus];

export const ContentState = {
  PUBLISHED: 'PUBLISHED',
  HIDDEN: 'HIDDEN',
  REVOKED: 'REVOKED',
  ARCHIVED: 'ARCHIVED',
} as const;
export type ContentState = (typeof ContentState)[keyof typeof ContentState];


export const SupportStatus = {
  WAITING: 'WAITING',
  HUMAN_ACTIVE: 'HUMAN_ACTIVE',
  RESOLVED: 'RESOLVED',
} as const;
export type SupportStatus = (typeof SupportStatus)[keyof typeof SupportStatus];

export const DataType = {
  TEXT: 'TEXT',
  LONG_TEXT: 'LONG_TEXT',
  RICH_TEXT: 'RICH_TEXT',
  NUMBER: 'NUMBER',
  NUMBER_WITH_UNIT: 'NUMBER_WITH_UNIT',
  CURRENCY: 'CURRENCY',
  RANGE: 'RANGE',
  SELECT_ONE: 'SELECT_ONE',
  SELECT_MANY: 'SELECT_MANY',
  BOOLEAN_TRI_STATE: 'BOOLEAN_TRI_STATE',
  DATE: 'DATE',
  TIME: 'TIME',
  SAFE_LINK: 'SAFE_LINK',
  IMAGE: 'IMAGE',
  GALLERY: 'GALLERY',
  TABLE: 'TABLE',
  REPEATER: 'REPEATER',
} as const;
export type DataType = (typeof DataType)[keyof typeof DataType];

export const BlockType = {
  HEADING: 'HEADING',
  PARAGRAPH: 'PARAGRAPH',
  LIST: 'LIST',
  IMAGE_CAPTION: 'IMAGE_CAPTION',
  GALLERY: 'GALLERY',
  CALLOUT: 'CALLOUT',
  FAQ: 'FAQ',
  SAFE_LINK: 'SAFE_LINK',
  MENU_SECTION: 'MENU_SECTION',
  AMENITY_GROUP: 'AMENITY_GROUP',
  REPEATER_VIEW: 'REPEATER_VIEW',
} as const;
export type BlockType = (typeof BlockType)[keyof typeof BlockType];
