// ============================================================
// Types for Admin Operations Workspace
// أنواع البيانات المتبادلة لعمليات إدارة المستخدمين والاستحقاقات والصفحة الرئيسية
// ============================================================

export type UserStatus = 'ACTIVE' | 'SUSPENDED' | 'BANNED' | 'PENDING_VERIFICATION';

export interface AdminUserDTO {
  _id: string;
  email: string;
  displayName: string;
  status: UserStatus;
  emailVerified: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  activeEntitlementsCount?: number;
  purchasesCount?: number;
  activeSubscriptionsCount?: number;
}

export interface UserPagination {
  page: number;
  limit: number;
  totalCount: number;
  totalPages: number;
}

export interface AdminEntitlementDTO {
  _id: string;
  type: string;
  source: string;
  targetSeries: {
    _id: string;
    title: string;
    slug: string;
  } | null;
  targetSeason: {
    _id: string;
    seasonNumber: number;
    title: string;
  } | null;
  validFrom: string;
  validUntil: string | null;
  isActive: boolean;
  grantedBy: {
    displayName: string;
    email: string;
  } | null;
  createdAt: string;
}

export interface AdminPurchaseDTO {
  _id: string;
  orderNumber: string;
  amount: number;
  currency: string;
  status: string;
  source: string;
  series: {
    title: string;
    slug: string;
  } | null;
  season: {
    title: string;
    seasonNumber: number;
  } | null;
  createdAt: string;
}

export interface AdminSubscriptionDTO {
  _id: string;
  plan: string;
  price: number;
  currency: string;
  status: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  source: string;
  createdAt: string;
}

export interface UserDetailData {
  user: AdminUserDTO;
  entitlements: AdminEntitlementDTO[];
  purchases: AdminPurchaseDTO[];
  subscriptions: AdminSubscriptionDTO[];
}

export type HomepageSectionLayout =
  | 'FEATURE'
  | 'EDITORIAL_SPLIT'
  | 'POSTER_WALL'
  | 'RAIL'
  | 'MOSAIC'
  | 'RANKED_LIST'
  | 'CINEMATIC_BANNER'
  | 'SPOTLIGHT';

export type HomepageSectionSource = 'MANUAL' | 'AUTOMATIC';

export type HomepageSectionAutoRule =
  | 'POPULAR'
  | 'NEWEST'
  | 'GENRE_FILTER'
  | 'EDITORIAL_CHOICE'
  | 'COMING_SOON'
  | 'MOST_COMPLETED'
  | 'CONTINUE_LISTENING';

export interface AdminHomepageSectionDTO {
  _id: string;
  key: string;
  title: string;
  subtitle: string;
  order: number;
  layout: HomepageSectionLayout;
  sourceType: HomepageSectionSource;
  autoRule: HomepageSectionAutoRule | null;
  filterGenre: string | null;
  manualSeriesIds: string[];
  manualSeries: Array<{
    _id: string;
    title: string;
    slug: string;
    posterUrl?: string;
  }>;
  isVisible: boolean;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SeasonOption {
  _id: string;
  seasonNumber: number;
  title: string;
}

export interface SeriesOption {
  _id: string;
  title: string;
  slug: string;
  posterUrl?: string;
  isPublished?: boolean;
  seasons?: SeasonOption[];
}

export interface ApiSuccess<T> {
  ok: true;
  data: T;
}

export interface ApiError {
  ok: false;
  status: number;
  error: string;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;
