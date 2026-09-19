import mongoose, { Schema, model, models } from 'mongoose';

// ============================================================
// 1. User Schema
// ============================================================
const UserSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    passwordHash: { type: String, required: true },
    displayName: { type: String, required: true, trim: true },
    avatar: { type: String },
    role: { type: String, enum: ['USER'], default: 'USER' },
    status: { type: String, enum: ['ACTIVE', 'SUSPENDED', 'BANNED', 'PENDING_VERIFICATION'], default: 'ACTIVE', index: true },
    emailVerified: { type: Boolean, default: false },
    verificationToken: { type: String },
    verificationExpires: { type: Date },
    resetPasswordToken: { type: String },
    resetPasswordExpires: { type: Date },
    failedLoginAttempts: { type: Number, default: 0 },
    lockUntil: { type: Date },
  },
  { timestamps: true }
);

// ============================================================
// 2. AdminUser Schema
// ============================================================
const AdminUserSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    passwordHash: { type: String, required: true },
    displayName: { type: String, required: true, trim: true },
    role: { 
      type: String, 
      enum: ['SUPER_ADMIN', 'ADMIN', 'CONTENT_EDITOR', 'MODERATOR', 'ANALYTICS_VIEWER'], 
      default: 'ADMIN',
      index: true 
    },
    status: { type: String, enum: ['ACTIVE', 'SUSPENDED'], default: 'ACTIVE' },
    twoFactorSecret: { type: String },
    lastLoginAt: { type: Date },
  },
  { timestamps: true }
);

// ============================================================
// 3. AdminAuditLog Schema
// ============================================================
const AdminAuditLogSchema = new Schema(
  {
    adminUserId: { type: Schema.Types.ObjectId, ref: 'AdminUser', required: true, index: true },
    action: { type: String, required: true },
    targetEntity: { type: String, required: true, index: true },
    entityId: { type: String, required: true, index: true },
    previousState: { type: Schema.Types.Mixed },
    newState: { type: Schema.Types.Mixed },
    ipAddress: { type: String },
    userAgent: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);
AdminAuditLogSchema.index({ adminUserId: 1, createdAt: -1 });

// ============================================================
// 4. Category Schema
// ============================================================
const CategorySchema = new Schema(
  {
    nameAr: { type: String, required: true },
    nameEn: { type: String, required: true },
    slug: { type: String, required: true, unique: true, index: true },
    description: { type: String },
    coverImage: { type: String },
    order: { type: Number, default: 0, index: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// ============================================================
// 5. Tag Schema
// ============================================================
const TagSchema = new Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    slug: { type: String, required: true, unique: true, index: true },
    seriesCount: { type: Number, default: 0 },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// ============================================================
// 6. Series Schema
// ============================================================
const SeriesSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    normalizedTitle: { type: String, index: true },
    slug: { type: String, required: true, unique: true, index: true },
    posterUrl: { type: String, required: true },
    heroArtworkUrl: { type: String, required: true },
    hook: { type: String, required: true },
    description: { type: String, required: true },
    genres: [{ type: String, index: true }],
    categoryIds: [{ type: Schema.Types.ObjectId, ref: 'Category' }],
    tagIds: [{ type: Schema.Types.ObjectId, ref: 'Tag' }],
    contentRating: { type: String, enum: ['GENERAL', 'PG13', 'PG16', 'PG18'], default: 'PG13' },
    contentWarnings: [{ type: String }],
    totalSeasonsCount: { type: Number, default: 1 },
    totalEpisodesCount: { type: Number, default: 0 },
    totalDurationSeconds: { type: Number, default: 0 },
    freeEpisodesCount: { type: Number, default: 2 },
    featured: { type: Boolean, default: false, index: true },
    isCompleted: { type: Boolean, default: false },
    productionYear: { type: Number, default: 2026 },
    shareVideoUrl: { type: String },
    publishedAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true }
);
SeriesSchema.index({ featured: 1, publishedAt: -1 });

// ============================================================
// 7. Season Schema
// ============================================================
const SeasonSchema = new Schema(
  {
    seriesId: { type: Schema.Types.ObjectId, ref: 'Series', required: true, index: true },
    seasonNumber: { type: Number, required: true },
    title: { type: String, required: true },
    description: { type: String },
    price: { type: Number, required: true, default: 0.5 },
    currency: { type: String, default: 'USD' },
    releaseStatus: { type: String, enum: ['AVAILABLE', 'COMING_SOON', 'IN_PRODUCTION'], default: 'AVAILABLE' },
    episodesCount: { type: Number, default: 0 },
    publishedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);
SeasonSchema.index({ seriesId: 1, seasonNumber: 1 }, { unique: true });

// ============================================================
// 8. Episode Schema
// ============================================================
const EpisodeSchema = new Schema(
  {
    seriesId: { type: Schema.Types.ObjectId, ref: 'Series', required: true, index: true },
    seasonId: { type: Schema.Types.ObjectId, ref: 'Season', required: true, index: true },
    seasonNumber: { type: Number, required: true },
    episodeNumber: { type: Number, required: true },
    title: { type: String, required: true },
    teaser: { type: String },
    audioStorageKey: { type: String },
    audioPublicUrl: { type: String },
    durationMs: { type: Number, required: true },
    isFree: { type: Boolean, default: false, index: true },
    artworkOverride: { type: String },
    publishDate: { type: Date, default: Date.now },
  },
  { timestamps: true }
);
EpisodeSchema.index({ seriesId: 1, seasonNumber: 1, episodeNumber: 1 }, { unique: true });

// ============================================================
// 9. Transcript Schema
// ============================================================
const TranscriptSchema = new Schema(
  {
    episodeId: { type: Schema.Types.ObjectId, ref: 'Episode', required: true, unique: true, index: true },
    segments: [
      {
        id: { type: String, required: true },
        startMs: { type: Number, required: true },
        endMs: { type: Number, required: true },
        text: { type: String, required: true },
        order: { type: Number, required: true },
      },
    ],
    format: { type: String, enum: ['VTT', 'SRT', 'JSON'], default: 'JSON' },
  },
  { timestamps: true }
);

// ============================================================
// 10. Entitlement Schema
// ============================================================
const EntitlementSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { 
      type: String, 
      enum: ['FREE_ACCESS', 'SEASON_PURCHASE', 'SERIES_PURCHASE', 'ACTIVE_SUBSCRIPTION', 'PROMOTIONAL_ACCESS', 'ADMIN_GRANT'], 
      required: true,
      index: true 
    },
    source: { 
      type: String, 
      enum: ['WEB', 'GOOGLE_PLAY', 'APP_STORE', 'PROMO', 'ADMIN'], 
      required: true 
    },
    targetSeriesId: { type: Schema.Types.ObjectId, ref: 'Series' },
    targetSeasonId: { type: Schema.Types.ObjectId, ref: 'Season' },
    validFrom: { type: Date, default: Date.now },
    validUntil: { type: Date, default: null },
    purchaseId: { type: Schema.Types.ObjectId, ref: 'Purchase' },
    subscriptionId: { type: Schema.Types.ObjectId, ref: 'Subscription' },
    grantedByAdminId: { type: Schema.Types.ObjectId, ref: 'AdminUser' },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);
EntitlementSchema.index({ userId: 1, isActive: 1 });
EntitlementSchema.index({ userId: 1, targetSeasonId: 1 });

// ============================================================
// 11. Purchase Schema
// ============================================================
const PurchaseSchema = new Schema(
  {
    // The account reference is removed when a user requests deletion. Keeping
    // the financial record without a user id preserves accounting/audit duties
    // without retaining a direct personal link.
    userId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    orderNumber: { type: String, required: true, unique: true, index: true },
    seasonId: { type: Schema.Types.ObjectId, ref: 'Season', required: true, index: true },
    seriesId: { type: Schema.Types.ObjectId, ref: 'Series', required: true },
    amount: { type: Number, required: true },
    currency: { type: String, default: 'USD' },
    status: { type: String, enum: ['PENDING', 'PAID', 'FAILED', 'CANCELLED', 'REFUNDED'], default: 'PENDING', index: true },
    source: { type: String, enum: ['WEB', 'GOOGLE_PLAY', 'APP_STORE', 'PROMO', 'ADMIN'], default: 'WEB' },
    paymentProvider: { type: String, required: true },
    providerTransactionId: { type: String },
    paymentMetadata: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

// ============================================================
// 12. Subscription Schema
// ============================================================
const SubscriptionSchema = new Schema(
  {
    // See PurchaseSchema.userId: subscriptions may be retained in an
    // anonymized form for billing/legal obligations after account deletion.
    userId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    plan: { type: String, enum: ['MONTHLY', 'ANNUAL'], required: true },
    price: { type: Number, required: true },
    currency: { type: String, default: 'USD' },
    status: { type: String, enum: ['ACTIVE', 'PAST_DUE', 'CANCELLED', 'EXPIRED'], default: 'ACTIVE', index: true },
    currentPeriodStart: { type: Date, default: Date.now },
    currentPeriodEnd: { type: Date, required: true },
    cancelAtPeriodEnd: { type: Boolean, default: false },
    source: { type: String, enum: ['WEB', 'GOOGLE_PLAY', 'APP_STORE', 'ADMIN'], default: 'WEB' },
    paymentProvider: { type: String, required: true },
    providerSubscriptionId: { type: String },
  },
  { timestamps: true }
);

// ============================================================
// 13. ListeningProgress Schema
// ============================================================
const ListeningProgressSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    episodeId: { type: Schema.Types.ObjectId, ref: 'Episode', required: true, index: true },
    seriesId: { type: Schema.Types.ObjectId, ref: 'Series', required: true, index: true },
    seasonId: { type: Schema.Types.ObjectId, ref: 'Season' },
    currentTimeMs: { type: Number, default: 0 },
    durationMs: { type: Number, default: 0 },
    percentage: { type: Number, default: 0 },
    completed: { type: Boolean, default: false },
  },
  { timestamps: true }
);
ListeningProgressSchema.index({ userId: 1, episodeId: 1 }, { unique: true });
ListeningProgressSchema.index({ userId: 1, updatedAt: -1 });

// ============================================================
// 14. Personal Interactions (Favorite, Saved, ListenLater, Like)
// ============================================================
const FavoriteSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    seriesId: { type: Schema.Types.ObjectId, ref: 'Series', required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);
FavoriteSchema.index({ userId: 1, seriesId: 1 }, { unique: true });

const SavedEpisodeSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    episodeId: { type: Schema.Types.ObjectId, ref: 'Episode', required: true },
    seriesId: { type: Schema.Types.ObjectId, ref: 'Series', required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);
SavedEpisodeSchema.index({ userId: 1, episodeId: 1 }, { unique: true });

// يطابق نموذج المنصة العامة حتى تظل تعريفات Mongo المشتركة متوافقة.
const SavedSeriesSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    seriesId: { type: Schema.Types.ObjectId, ref: 'Series', required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);
SavedSeriesSchema.index({ userId: 1, seriesId: 1 }, { unique: true });

const ListenLaterSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    seriesId: { type: Schema.Types.ObjectId, ref: 'Series', required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);
ListenLaterSchema.index({ userId: 1, seriesId: 1 }, { unique: true });

const LikeSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    seriesId: { type: Schema.Types.ObjectId, ref: 'Series', required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);
LikeSchema.index({ userId: 1, seriesId: 1 }, { unique: true });

// ============================================================
// 15. Comments & Moderation
// ============================================================
const CommentSchema = new Schema(
  {
    episodeId: { type: Schema.Types.ObjectId, ref: 'Episode', required: true, index: true },
    seriesId: { type: Schema.Types.ObjectId, ref: 'Series', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    parentId: { type: Schema.Types.ObjectId, ref: 'Comment' },
    content: { type: String, required: true, trim: true },
    status: { type: String, enum: ['VISIBLE', 'HIDDEN', 'FLAGGED', 'DELETED_BY_USER', 'REMOVED_BY_ADMIN'], default: 'VISIBLE', index: true },
    likesCount: { type: Number, default: 0 },
    repliesCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);
CommentSchema.index({ episodeId: 1, parentId: 1, createdAt: -1 });

const CommentLikeSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    commentId: { type: Schema.Types.ObjectId, ref: 'Comment', required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);
CommentLikeSchema.index({ userId: 1, commentId: 1 }, { unique: true });

const CommentReportSchema = new Schema(
  {
    commentId: { type: Schema.Types.ObjectId, ref: 'Comment', required: true },
    reporterUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    reason: { type: String, required: true },
    status: { type: String, enum: ['PENDING', 'RESOLVED', 'DISMISSED'], default: 'PENDING' },
    reviewedByAdminId: { type: Schema.Types.ObjectId, ref: 'AdminUser' },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);
// يمنع تكرار البلاغ المعلّق من نفس المستخدم على نفس التعليق حتى مع
// طلبات متزامنة؛ تغيير الحالة إلى RESOLVED/DISMISSED يسمح بإعادة البلاغ لاحقاً.
CommentReportSchema.index({ commentId: 1, reporterUserId: 1, status: 1 }, { unique: true });

const BlockedUserSchema = new Schema(
  {
    blockerUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    blockedUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);
BlockedUserSchema.index({ blockerUserId: 1, blockedUserId: 1 }, { unique: true });

// ============================================================
// 16. HomepageSection Schema
// ============================================================
const HomepageSectionSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, index: true },
    title: { type: String, required: true },
    subtitle: { type: String },
    order: { type: Number, required: true, index: true },
    layout: { 
      type: String, 
      enum: ['FEATURE', 'EDITORIAL_SPLIT', 'POSTER_WALL', 'RAIL', 'MOSAIC', 'RANKED_LIST', 'CINEMATIC_BANNER', 'SPOTLIGHT'], 
      required: true 
    },
    sourceType: { type: String, enum: ['MANUAL', 'AUTOMATIC'], default: 'AUTOMATIC' },
    autoRule: { 
      type: String, 
      enum: ['POPULAR', 'NEWEST', 'GENRE_FILTER', 'EDITORIAL_CHOICE', 'COMING_SOON', 'MOST_COMPLETED', 'CONTINUE_LISTENING'] 
    },
    filterCategoryId: {
      type: Schema.Types.ObjectId,
      ref: 'Category',
      index: true,
    },
    manualSeriesIds: [{ type: Schema.Types.ObjectId, ref: 'Series' }],
    isVisible: { type: Boolean, default: true, index: true },
    scheduledStart: { type: Date },
    scheduledEnd: { type: Date },
  },
  { timestamps: true }
);

// ============================================================
// 17. ShareAsset Schema
// ============================================================
const ShareAssetSchema = new Schema(
  {
    seriesId: { type: Schema.Types.ObjectId, ref: 'Series', required: true, index: true },
    type: { 
      type: String, 
      enum: ['IMAGE_1080x1350', 'IMAGE_1080x1920', 'IMAGE_1200x630', 'VIDEO_PRE_RENDERED'], 
      required: true 
    },
    title: { type: String, required: true },
    storageKey: { type: String, required: true },
    publicUrl: { type: String, required: true },
    durationMs: { type: Number },
    fileSizeBytes: { type: Number },
    uploadedByAdminId: { type: Schema.Types.ObjectId, ref: 'AdminUser' },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);
ShareAssetSchema.index({ seriesId: 1, type: 1 });

// ============================================================
// 18. PolicyDocument & PolicyAcceptance
// ============================================================
const PolicyDocumentSchema = new Schema(
  {
    type: { 
      type: String, 
      enum: ['TERMS', 'PRIVACY', 'PAYMENTS_REFUNDS', 'COMMUNITY', 'COPYRIGHT', 'COOKIES', 'DELETION'], 
      required: true 
    },
    version: { type: String, required: true },
    titleAr: { type: String, required: true },
    titleEn: { type: String, required: true },
    summaryAr: { type: String, required: true },
    summaryEn: { type: String, required: true },
    contentAr: { type: String, required: true },
    contentEn: { type: String, required: true },
    isPublished: { type: Boolean, default: true },
    publishedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);
PolicyDocumentSchema.index({ type: 1, version: 1 }, { unique: true });

const PolicyAcceptanceSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    policyType: { type: String, required: true },
    policyVersion: { type: String, required: true },
    acceptedAt: { type: Date, default: Date.now },
    ipAddress: { type: String },
    userAgent: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);
PolicyAcceptanceSchema.index({ userId: 1, policyType: 1 });

// ============================================================
// 19. NotificationPreference Schema
// ============================================================
const NotificationPreferenceSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    emailNewEpisodes: { type: Boolean, default: true },
    emailSubscriptionAlerts: { type: Boolean, default: true },
    emailMarketing: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// ============================================================
// 20. ProductEvent & DailyAnalyticsAggregate
// ============================================================
const ProductEventSchema = new Schema(
  {
    eventName: { 
      type: String, 
      enum: [
        'SERIES_VIEW', 'EPISODE_START', 'EPISODE_25', 'EPISODE_50', 'EPISODE_75', 
        'EPISODE_COMPLETE', 'NEXT_EPISODE_AUTOPLAY', 'MODE_LISTEN', 'MODE_READ_LISTEN', 
        'SHARE_LINK', 'SHARE_IMAGE', 'SHARE_VIDEO', 'PAYWALL_VIEW', 'CHECKOUT_START', 
        'PURCHASE_SUCCESS', 'SUBSCRIPTION_START', 'FAVORITE', 'SAVE', 'COMMENT'
      ],
      required: true,
      index: true 
    },
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    anonymousId: { type: String },
    seriesId: { type: Schema.Types.ObjectId, ref: 'Series' },
    episodeId: { type: Schema.Types.ObjectId, ref: 'Episode' },
    metadata: { type: Schema.Types.Mixed },
    timestamp: { type: Date, default: Date.now, index: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

const DailyAnalyticsAggregateSchema = new Schema(
  {
    date: { type: String, required: true, unique: true, index: true }, // Format: YYYY-MM-DD
    seriesViews: { type: Number, default: 0 },
    episodeStarts: { type: Number, default: 0 },
    episodeCompletions: { type: Number, default: 0 },
    listeningHours: { type: Number, default: 0 },
    paywallViews: { type: Number, default: 0 },
    checkoutStarts: { type: Number, default: 0 },
    seasonPurchases: { type: Number, default: 0 },
    subscriptionStarts: { type: Number, default: 0 },
    totalRevenueUsd: { type: Number, default: 0 },
    uniqueListeners: { type: Number, default: 0 },
    sharesCount: { type: Number, default: 0 },
    commentsCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// ============================================================
// 21. PlatformSetting Schema
// ============================================================
const PlatformSettingSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, index: true },
    value: { type: Schema.Types.Mixed, required: true },
    description: { type: String },
    updatedByAdminId: { type: Schema.Types.ObjectId, ref: 'AdminUser' },
  },
  { timestamps: true }
);

// Export all models safely for Next.js hot reloading
export const User = models.User || model('User', UserSchema);
export const AdminUser = models.AdminUser || model('AdminUser', AdminUserSchema);
export const AdminAuditLog = models.AdminAuditLog || model('AdminAuditLog', AdminAuditLogSchema);
export const Category = models.Category || model('Category', CategorySchema);
export const Tag = models.Tag || model('Tag', TagSchema);
export const Series = models.Series || model('Series', SeriesSchema);
export const Season = models.Season || model('Season', SeasonSchema);
export const Episode = models.Episode || model('Episode', EpisodeSchema);
export const Transcript = models.Transcript || model('Transcript', TranscriptSchema);
export const Entitlement = models.Entitlement || model('Entitlement', EntitlementSchema);
export const Purchase = models.Purchase || model('Purchase', PurchaseSchema);
export const Subscription = models.Subscription || model('Subscription', SubscriptionSchema);
export const ListeningProgress = models.ListeningProgress || model('ListeningProgress', ListeningProgressSchema);
export const Favorite = models.Favorite || model('Favorite', FavoriteSchema);
export const SavedEpisode = models.SavedEpisode || model('SavedEpisode', SavedEpisodeSchema);
export const SavedSeries = models.SavedSeries || model('SavedSeries', SavedSeriesSchema);
export const ListenLater = models.ListenLater || model('ListenLater', ListenLaterSchema);
export const Like = models.Like || model('Like', LikeSchema);
export const Comment = models.Comment || model('Comment', CommentSchema);
export const CommentLike = models.CommentLike || model('CommentLike', CommentLikeSchema);
export const CommentReport = models.CommentReport || model('CommentReport', CommentReportSchema);
export const BlockedUser = models.BlockedUser || model('BlockedUser', BlockedUserSchema);
export const HomepageSection = models.HomepageSection || model('HomepageSection', HomepageSectionSchema);
export const ShareAsset = models.ShareAsset || model('ShareAsset', ShareAssetSchema);
export const PolicyDocument = models.PolicyDocument || model('PolicyDocument', PolicyDocumentSchema);
export const PolicyAcceptance = models.PolicyAcceptance || model('PolicyAcceptance', PolicyAcceptanceSchema);
export const NotificationPreference = models.NotificationPreference || model('NotificationPreference', NotificationPreferenceSchema);
export const ProductEvent = models.ProductEvent || model('ProductEvent', ProductEventSchema);
export const DailyAnalyticsAggregate = models.DailyAnalyticsAggregate || model('DailyAnalyticsAggregate', DailyAnalyticsAggregateSchema);
export const PlatformSetting = models.PlatformSetting || model('PlatformSetting', PlatformSettingSchema);
