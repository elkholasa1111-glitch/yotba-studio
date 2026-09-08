// ============================================================
// Types Definition - منصة "يُتبع..." (yotba.com)
// ============================================================

export type UserRole = 'USER';

export type AdminRole = 
  | 'SUPER_ADMIN' 
  | 'ADMIN' 
  | 'CONTENT_EDITOR' 
  | 'MODERATOR' 
  | 'ANALYTICS_VIEWER';

export type UserStatus = 'ACTIVE' | 'SUSPENDED' | 'BANNED' | 'PENDING_VERIFICATION';

export type ContentRating = 'GENERAL' | 'PG13' | 'PG16' | 'PG18';

export type SeasonReleaseStatus = 'AVAILABLE' | 'COMING_SOON' | 'IN_PRODUCTION';

export type EntitlementType = 
  | 'FREE_ACCESS'
  | 'SEASON_PURCHASE'
  | 'SERIES_PURCHASE'
  | 'ACTIVE_SUBSCRIPTION'
  | 'PROMOTIONAL_ACCESS'
  | 'ADMIN_GRANT';

export type PurchaseSource = 
  | 'WEB'
  | 'GOOGLE_PLAY'
  | 'APP_STORE'
  | 'PROMO'
  | 'ADMIN';

export type PaymentStatus = 
  | 'PENDING'
  | 'PAID'
  | 'FAILED'
  | 'CANCELLED'
  | 'REFUNDED'
  | 'EXPIRED';

export type SubscriptionPlan = 'MONTHLY' | 'ANNUAL';

export type SubscriptionStatus = 
  | 'ACTIVE'
  | 'PAST_DUE'
  | 'CANCELLED'
  | 'EXPIRED';

export type CommentStatus = 
  | 'VISIBLE'
  | 'HIDDEN'
  | 'FLAGGED'
  | 'DELETED_BY_USER'
  | 'REMOVED_BY_ADMIN';

export type HomepageLayout = 
  | 'FEATURE'
  | 'EDITORIAL_SPLIT'
  | 'POSTER_WALL'
  | 'RAIL'
  | 'MOSAIC'
  | 'RANKED_LIST'
  | 'CINEMATIC_BANNER'
  | 'SPOTLIGHT';

export type HomepageAutoRule = 
  | 'POPULAR'
  | 'NEWEST'
  | 'GENRE_FILTER'
  | 'EDITORIAL_CHOICE'
  | 'COMING_SOON'
  | 'MOST_COMPLETED'
  | 'CONTINUE_LISTENING';

export type ShareAssetType = 
  | 'IMAGE_1080x1350'
  | 'IMAGE_1080x1920'
  | 'IMAGE_1200x630'
  | 'VIDEO_PRE_RENDERED';

export type PolicyType = 
  | 'TERMS'
  | 'PRIVACY'
  | 'PAYMENTS_REFUNDS'
  | 'COMMUNITY'
  | 'COPYRIGHT'
  | 'COOKIES'
  | 'DELETION';

export type ProductEventName = 
  | 'SERIES_VIEW'
  | 'EPISODE_START'
  | 'EPISODE_25'
  | 'EPISODE_50'
  | 'EPISODE_75'
  | 'EPISODE_COMPLETE'
  | 'NEXT_EPISODE_AUTOPLAY'
  | 'MODE_LISTEN'
  | 'MODE_READ_LISTEN'
  | 'SHARE_LINK'
  | 'SHARE_IMAGE'
  | 'SHARE_VIDEO'
  | 'PAYWALL_VIEW'
  | 'CHECKOUT_START'
  | 'PURCHASE_SUCCESS'
  | 'SUBSCRIPTION_START'
  | 'FAVORITE'
  | 'SAVE'
  | 'COMMENT';

// Segment structure for Read+Listen timed transcript
export interface TranscriptSegment {
  id: string;
  startMs: number;
  endMs: number;
  text: string;
  order: number;
}

// User Profile
export interface IUser {
  _id: string;
  email: string;
  displayName: string;
  avatar?: string;
  status: UserStatus;
  emailVerified: boolean;
  createdAt: string;
}

// Admin Profile
export interface IAdminUser {
  _id: string;
  email: string;
  displayName: string;
  role: AdminRole;
  status: 'ACTIVE' | 'SUSPENDED';
  lastLoginAt?: string;
}

// Series Entity
export interface ISeries {
  _id: string;
  title: string;
  normalizedTitle?: string;
  slug: string;
  posterUrl: string;
  heroArtworkUrl: string;
  hook: string;
  description: string;
  genres: string[];
  categoryIds?: string[];
  tagIds?: string[];
  contentRating: ContentRating;
  contentWarnings: string[];
  totalSeasonsCount: number;
  totalEpisodesCount: number;
  totalDurationSeconds: number;
  freeEpisodesCount: number;
  featured: boolean;
  isCompleted: boolean;
  productionYear?: number;
  publishedAt?: string;
  shareVideoUrl?: string;
  seasons?: ISeason[];
}

// Season Entity
export interface ISeason {
  _id: string;
  seriesId: string;
  seasonNumber: number;
  title: string;
  description?: string;
  price: number;
  currency: string;
  releaseStatus: SeasonReleaseStatus;
  episodesCount: number;
  publishedAt?: string;
  episodes?: IEpisode[];
}

// Episode Entity
export interface IEpisode {
  _id: string;
  seriesId: string;
  seasonId: string;
  seasonNumber: number;
  episodeNumber: number;
  title: string;
  teaser: string;
  audioStorageKey?: string;
  audioPublicUrl?: string;
  durationMs: number;
  isFree: boolean;
  artworkOverride?: string;
  publishDate?: string;
}

// Transcript Entity
export interface ITranscript {
  _id: string;
  episodeId: string;
  segments: TranscriptSegment[];
  format: 'VTT' | 'SRT' | 'JSON';
  updatedAt: string;
}

// Unified Entitlement
export interface IEntitlement {
  _id: string;
  userId: string;
  type: EntitlementType;
  source: PurchaseSource;
  targetSeriesId?: string;
  targetSeasonId?: string;
  validFrom: string;
  validUntil?: string | null;
  isActive: boolean;
}

// Listening Progress
export interface IListeningProgress {
  episodeId: string;
  seriesId: string;
  seasonId?: string;
  currentTimeMs: number;
  durationMs: number;
  percentage: number;
  completed: boolean;
  updatedAt: string;
}

// Comments
export interface IComment {
  _id: string;
  episodeId: string;
  seriesId: string;
  userId: string;
  userDisplayName: string;
  userAvatar?: string;
  parentId?: string;
  content: string;
  likesCount: number;
  repliesCount: number;
  createdAt: string;
  isLikedByCurrentUser?: boolean;
}
