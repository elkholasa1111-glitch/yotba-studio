'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  KeyRound,
  Plus,
  Trash2,
  Search,
  Calendar,
  AlertCircle,
  Loader2,
  X,
  CreditCard,
  Layers,
} from 'lucide-react';
import {
  AdminUserDTO,
  AdminEntitlementDTO,
  AdminPurchaseDTO,
  AdminSubscriptionDTO,
  SeriesOption,
  SeasonOption,
} from './types';
import {
  fetchUsers,
  fetchEntitlements,
  grantEntitlement,
  revokeEntitlement,
} from './operations-client';
import { ConfirmModal } from './ConfirmModal';

interface EntitlementsPanelProps {
  selectedUser?: AdminUserDTO | null;
  onNotice?: (type: 'success' | 'error', msg: string) => void;
}

export const EntitlementsPanel: React.FC<EntitlementsPanelProps> = ({
  selectedUser: initialUser = null,
  onNotice,
}) => {
  const [activeUser, setActiveUser] = useState<AdminUserDTO | null>(initialUser);
  const [userSearchTerm, setUserSearchTerm] = useState('');
  const [userSearchResults, setUserSearchResults] = useState<AdminUserDTO[]>([]);
  const [isSearchingUsers, setIsSearchingUsers] = useState(false);

  // استحقاقات ومشتريات المستخدم المحدد
  const [entitlements, setEntitlements] = useState<AdminEntitlementDTO[]>([]);
  const [purchases, setPurchases] = useState<AdminPurchaseDTO[]>([]);
  const [subscriptions, setSubscriptions] = useState<AdminSubscriptionDTO[]>([]);
  const [seriesOptions, setSeriesOptions] = useState<SeriesOption[]>([]);
  const [isLoadingEntitlements, setIsLoadingEntitlements] = useState(false);

  // نافذة منح استحقاق
  const [isGrantModalOpen, setIsGrantModalOpen] = useState(false);
  const [grantTargetType, setGrantTargetType] = useState<'SERIES' | 'SEASON'>('SERIES');
  const [selectedSeriesId, setSelectedSeriesId] = useState('');
  const [selectedSeasonId, setSelectedSeasonId] = useState('');
  const [grantValidUntil, setGrantValidUntil] = useState('');
  const [grantReason, setGrantReason] = useState('');
  const [isSubmittingGrant, setIsSubmittingGrant] = useState(false);
  const [grantError, setGrantError] = useState<string | null>(null);

  // نافذة تأكيد إلغاء الاستحقاق
  const [revokeTarget, setRevokeTarget] = useState<AdminEntitlementDTO | null>(null);
  const [isRevoking, setIsRevoking] = useState(false);

  const searchDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const entitlementAbortRef = useRef<AbortController | null>(null);
  const userSearchAbortRef = useRef<AbortController | null>(null);
  const grantCloseRef = useRef<HTMLButtonElement>(null);

  // تحديث المستخدم النشط إذا تغير prop الخارجي
  useEffect(() => {
    if (initialUser) {
      setActiveUser(initialUser);
    }
  }, [initialUser]);

  // جلب خيارات الكتالوج وبيانات استحقاقات المستخدم
  const loadUserData = useCallback(
    async (userId?: string) => {
      entitlementAbortRef.current?.abort();
      const controller = new AbortController();
      entitlementAbortRef.current = controller;
      setIsLoadingEntitlements(true);
      const res = await fetchEntitlements(userId, true, controller.signal);
      if (controller.signal.aborted) return;
      setIsLoadingEntitlements(false);

      if (res.ok) {
        if (res.data.seriesOptions) {
          setSeriesOptions(res.data.seriesOptions);
        }
        if (userId) {
          setEntitlements(res.data.entitlements || []);
          setPurchases(res.data.purchases || []);
          setSubscriptions(res.data.subscriptions || []);
        }
      } else {
        onNotice?.('error', res.error);
      }
    },
    [onNotice]
  );

  useEffect(() => {
    loadUserData(activeUser?._id);
  }, [activeUser, loadUserData]);

  useEffect(() => {
    return () => {
      entitlementAbortRef.current?.abort();
      userSearchAbortRef.current?.abort();
      if (searchDebounceRef.current) window.clearTimeout(searchDebounceRef.current);
    };
  }, []);

  useEffect(() => {
    if (!isGrantModalOpen) return;
    const timer = window.setTimeout(() => grantCloseRef.current?.focus(), 0);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isSubmittingGrant) {
        event.preventDefault();
        setIsGrantModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isGrantModalOpen, isSubmittingGrant]);

  // البحث عن مستخدمين
  const handleUserSearch = (term: string) => {
    setUserSearchTerm(term);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    if (!term.trim()) {
      userSearchAbortRef.current?.abort();
      setIsSearchingUsers(false);
      setUserSearchResults([]);
      return;
    }

    searchDebounceRef.current = setTimeout(async () => {
      userSearchAbortRef.current?.abort();
      const controller = new AbortController();
      userSearchAbortRef.current = controller;
      setIsSearchingUsers(true);
      const res = await fetchUsers({ query: term.trim(), limit: 5 }, controller.signal);
      if (controller.signal.aborted) return;
      setIsSearchingUsers(false);
      if (res.ok) {
        setUserSearchResults(res.data.users);
      }
    }, 300);
  };

  // اختيار مستخدم من نتائج البحث
  const handleSelectUser = (user: AdminUserDTO) => {
    setActiveUser(user);
    setUserSearchTerm('');
    setUserSearchResults([]);
  };

  // المواسم المتاحة للمسلسل المختار في نافذة المنح
  const activeSeries = seriesOptions.find((s) => s._id === selectedSeriesId);
  const availableSeasons: SeasonOption[] = activeSeries?.seasons || [];

  // فتح نافذة المنح
  const handleOpenGrantModal = () => {
    setGrantTargetType('SERIES');
    setSelectedSeriesId(seriesOptions[0]?._id || '');
    setSelectedSeasonId('');
    setGrantValidUntil('');
    setGrantReason('');
    setGrantError(null);
    setIsGrantModalOpen(true);
  };

  // تنفيذ منح الاستحقاق
  const handleGrantSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeUser) return;

    if (grantTargetType === 'SERIES' && !selectedSeriesId) {
      setGrantError('يرجى اختيار المسلسل المطلوب');
      return;
    }
    if (grantTargetType === 'SEASON' && !selectedSeasonId) {
      setGrantError('يرجى اختيار الموسم المطلوب');
      return;
    }

    setIsSubmittingGrant(true);
    setGrantError(null);

    const payload = {
      userId: activeUser._id,
      targetSeriesId: grantTargetType === 'SERIES' ? selectedSeriesId : undefined,
      targetSeasonId: grantTargetType === 'SEASON' ? selectedSeasonId : undefined,
      validUntil: grantValidUntil ? new Date(grantValidUntil).toISOString() : null,
      reason: grantReason.trim() || undefined,
    };

    const res = await grantEntitlement(payload);
    setIsSubmittingGrant(false);

    if (res.ok) {
      onNotice?.('success', 'تم منح الاستحقاق الإداري بنجاح');
      setIsGrantModalOpen(false);
      // إعادة تحميل الاستحقاقات
      loadUserData(activeUser._id);
    } else {
      setGrantError(res.error);
    }
  };

  // تنفيذ إلغاء الاستحقاق
  const handleConfirmRevoke = async () => {
    if (!revokeTarget) return;
    setIsRevoking(true);

    const res = await revokeEntitlement(revokeTarget._id);
    setIsRevoking(false);
    setRevokeTarget(null);

    if (res.ok) {
      onNotice?.('success', 'تم إلغاء الاستحقاق بنجاح');
      if (activeUser) {
        loadUserData(activeUser._id);
      }
    } else {
      onNotice?.('error', res.error);
    }
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* قسم اختيار أو تغيير المستخدم النشط */}
      <div className="rounded-xl border border-border-subtle bg-surface p-5 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-bold text-editorial-ivory flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-crimson" />
              <span>إدارة استحقاقات المستخدم</span>
            </h2>
            <p className="text-xs text-editorial-secondary mt-1">
              اختر مستخدماً لاستعراض استحقاقاته أو منحه صلاحية وصول إدارية (ADMIN_GRANT) لمسلسل أو موسم.
            </p>
          </div>

          {activeUser && (
            <button
              type="button"
              onClick={handleOpenGrantModal}
              className="min-h-11 px-4 py-2 rounded-lg bg-crimson hover:bg-crimson-bright text-white text-xs font-bold shadow-halo flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson"
            >
              <Plus className="h-4 w-4" />
              <span>منح استحقاق جديد</span>
            </button>
          )}
        </div>

        {/* صندوق البحث عن مستخدم */}
        <div className="relative">
          <label htmlFor="entitlement-user-search" className="sr-only">
            ابحث عن مستخدم
          </label>
          <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-editorial-secondary">
            <Search className="h-4 w-4" />
          </div>
          <input
            id="entitlement-user-search"
            type="search"
            value={userSearchTerm}
            onChange={(e) => handleUserSearch(e.target.value)}
            placeholder="ابحث عن مستخدم بالاسم أو البريد الإلكتروني لتحديده..."
            className="min-h-11 w-full rounded-lg border border-border-subtle bg-obsidian-850 pr-10 pl-4 text-sm text-editorial-ivory placeholder:text-editorial-secondary/60 focus:border-crimson focus:outline-none focus-visible:ring-2 focus-visible:ring-crimson"
          />

          {/* قائمة نتائج البحث السريع */}
          {userSearchResults.length > 0 && (
            <div className="absolute top-full right-0 left-0 z-30 mt-1 rounded-lg border border-border-strong bg-surface-modal p-2 shadow-cinematic">
              {userSearchResults.map((u) => (
                <button
                  key={u._id}
                  type="button"
                  onClick={() => handleSelectUser(u)}
                  className="min-h-11 w-full px-3 py-2 text-right rounded-lg hover:bg-surface-elevated flex items-center justify-between gap-3 text-xs"
                >
                  <div>
                    <span className="font-bold text-editorial-ivory">{u.displayName}</span>
                    <span className="mr-2 text-editorial-secondary dir-ltr">({u.email})</span>
                  </div>
                  <span className="text-[11px] px-2 py-0.5 rounded bg-surface border border-border-subtle text-editorial-secondary">
                    {u.status}
                  </span>
                </button>
              ))}
            </div>
          )}

          {isSearchingUsers && (
            <div className="absolute left-3 top-3 text-editorial-secondary">
              <Loader2 className="h-4 w-4 animate-spin text-crimson" />
            </div>
          )}
        </div>

        {/* بطاقة المستخدم النشط المحدد */}
        {activeUser ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border-subtle bg-surface-elevated p-3 text-xs">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-crimson-subtle text-crimson font-bold">
                {activeUser.displayName.slice(0, 1).toUpperCase()}
              </div>
              <div>
                <div className="font-bold text-editorial-ivory text-sm">{activeUser.displayName}</div>
                <div className="text-editorial-secondary dir-ltr text-right">{activeUser.email}</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 rounded-full border border-border-subtle bg-surface text-editorial-secondary font-semibold">
                حالة الحساب: {activeUser.status}
              </span>
              <button
                type="button"
                onClick={() => setActiveUser(null)}
                className="min-h-11 px-3 py-1 text-editorial-secondary hover:text-editorial-ivory text-xs"
              >
                إلغاء التحديد
              </button>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border-subtle bg-obsidian-850/50 p-6 text-center text-xs text-editorial-secondary">
            لم يتم اختيار مستخدم بعد. استخدم البحث أعلاه لاختيار المستخدم المطلوب استعراض أو منح استحقاقاته.
          </div>
        )}
      </div>

      {/* استعراض الاستحقاقات والمشتريات إذا كان هناك مستخدم محدد */}
      {activeUser && (
        <div className="space-y-6">
          {isLoadingEntitlements ? (
            <div className="flex min-h-[200px] items-center justify-center rounded-xl border border-border-subtle bg-surface">
              <Loader2 className="h-7 w-7 animate-spin text-crimson" />
            </div>
          ) : (
            <>
              {/* قائمة الاستحقاقات */}
              <div className="rounded-xl border border-border-subtle bg-surface p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-editorial-ivory flex items-center gap-2">
                    <Layers className="h-4 w-4 text-crimson" />
                    <span>الاستحقاقات المسجلة ({entitlements.length})</span>
                  </h3>
                </div>

                {entitlements.length === 0 ? (
                  <p className="text-xs text-editorial-secondary bg-surface-elevated p-4 rounded-lg">
                    لا يملك هذا المستخدم أي استحقاقات حالية.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-right text-xs">
                      <thead className="border-b border-border-subtle bg-surface-elevated text-editorial-secondary font-semibold">
                        <tr>
                          <th scope="col" className="px-3 py-2.5">المحتوى المستحق</th>
                          <th scope="col" className="px-3 py-2.5">النوع والمصدر</th>
                          <th scope="col" className="px-3 py-2.5">الصلاحية</th>
                          <th scope="col" className="px-3 py-2.5">الحالة</th>
                          <th scope="col" className="px-3 py-2.5 text-left">الإجراء</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border-subtle">
                        {entitlements.map((ent) => {
                          const targetLabel = ent.targetSeason
                            ? `${ent.targetSeries?.title || 'مسلسل'} — الموسم ${ent.targetSeason.seasonNumber} (${ent.targetSeason.title})`
                            : ent.targetSeries?.title || 'استحقاق شامل';

                          return (
                            <tr key={ent._id} className="hover:bg-surface-elevated/40">
                              <td className="px-3 py-3 font-semibold text-editorial-ivory">
                                {targetLabel}
                              </td>
                              <td className="px-3 py-3 text-editorial-secondary">
                                <span className="font-mono text-[11px]">{ent.type}</span>
                                <span className="mx-1">•</span>
                                <span>{ent.source}</span>
                              </td>
                              <td className="px-3 py-3 text-editorial-secondary">
                                {ent.validUntil ? (
                                  <span>
                                    حتى {new Date(ent.validUntil).toLocaleDateString('ar-EG')}
                                  </span>
                                ) : (
                                  <span className="text-emerald-400">دائم (بلا تاريخ انتهاء)</span>
                                )}
                              </td>
                              <td className="px-3 py-3">
                                <span
                                  className={`inline-flex px-2 py-0.5 rounded text-[11px] font-bold ${
                                    ent.isActive
                                      ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-800/40'
                                      : 'bg-surface text-editorial-secondary line-through border border-border-subtle'
                                  }`}
                                >
                                  {ent.isActive ? 'نشط' : 'ملغى'}
                                </span>
                              </td>
                              <td className="px-3 py-3 text-left">
                                {ent.isActive && ent.type === 'ADMIN_GRANT' && ent.source === 'ADMIN' && (
                                  <button
                                    type="button"
                                    onClick={() => setRevokeTarget(ent)}
                                    className="min-h-11 px-3 py-1.5 rounded-lg border border-crimson/40 bg-crimson-subtle text-xs font-semibold text-crimson-bright hover:bg-crimson/30 inline-flex items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                    <span>إلغاء</span>
                                  </button>
                                )}
                                {ent.isActive && !(ent.type === 'ADMIN_GRANT' && ent.source === 'ADMIN') && (
                                  <span className="text-[11px] text-editorial-secondary" title="تُدار هذه الصلاحية من خلال مسار الدفع">
                                    صلاحية مدفوعة
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* المشتريات والاشتراكات في شبكة عرض */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* المشتريات */}
                <div className="rounded-xl border border-border-subtle bg-surface p-4 space-y-3">
                  <h3 className="text-sm font-bold text-editorial-ivory flex items-center gap-2">
                    <CreditCard className="h-4 w-4 text-crimson" />
                    <span>المشتريات المباشرة ({purchases.length})</span>
                  </h3>
                  {purchases.length === 0 ? (
                    <p className="text-xs text-editorial-secondary bg-surface-elevated p-3 rounded-lg">
                      لا توجد عمليات شراء.
                    </p>
                  ) : (
                    <div className="space-y-2 max-h-52 overflow-y-auto">
                      {purchases.map((p) => (
                        <div
                          key={p._id}
                          className="flex items-center justify-between p-2.5 rounded-lg border border-border-subtle bg-surface-elevated text-xs"
                        >
                          <div>
                            <div className="font-semibold text-editorial-ivory">
                              {p.series?.title || 'مسلسل'} {p.season ? `(موسم ${p.season.seasonNumber})` : ''}
                            </div>
                            <div className="text-[11px] text-editorial-secondary font-mono">
                              #{p.orderNumber}
                            </div>
                          </div>
                          <div className="text-left">
                            <span className="font-bold text-editorial-ivory">
                              {p.amount} {p.currency}
                            </span>
                            <div className="text-[10px] text-editorial-secondary">{p.status}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* الاشتراكات */}
                <div className="rounded-xl border border-border-subtle bg-surface p-4 space-y-3">
                  <h3 className="text-sm font-bold text-editorial-ivory flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-crimson" />
                    <span>الاشتراكات الدورية ({subscriptions.length})</span>
                  </h3>
                  {subscriptions.length === 0 ? (
                    <p className="text-xs text-editorial-secondary bg-surface-elevated p-3 rounded-lg">
                      لا توجد اشتراكات مسجلة.
                    </p>
                  ) : (
                    <div className="space-y-2 max-h-52 overflow-y-auto">
                      {subscriptions.map((s) => (
                        <div
                          key={s._id}
                          className="flex items-center justify-between p-2.5 rounded-lg border border-border-subtle bg-surface-elevated text-xs"
                        >
                          <div>
                            <div className="font-semibold text-editorial-ivory">
                              باقة {s.plan === 'ANNUAL' ? 'سنوية' : 'شهرية'}
                            </div>
                            <div className="text-[11px] text-editorial-secondary">
                              تنتهي في {new Date(s.currentPeriodEnd).toLocaleDateString('ar-EG')}
                            </div>
                          </div>
                          <div className="text-left">
                            <span className="font-bold text-editorial-ivory">
                              {s.price} {s.currency}
                            </span>
                            <div className="text-[10px] text-emerald-400 font-semibold">{s.status}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* نافذة منح استحقاق إداري (Modal Dialog) */}
      {isGrantModalOpen && activeUser && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-obsidian-950/80 p-4 backdrop-blur-sm"
          role="presentation"
          onClick={() => {
            if (!isSubmittingGrant) setIsGrantModalOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="grant-modal-title"
            className="w-full max-w-lg rounded-xl border border-border-strong bg-surface-modal p-6 text-right shadow-cinematic"
            onClick={(e) => e.stopPropagation()}
            dir="rtl"
          >
            <div className="flex items-center justify-between border-b border-border-subtle pb-4">
              <h2 id="grant-modal-title" className="text-base font-bold text-editorial-ivory">
                منح استحقاق إداري لمستخدم ({activeUser.displayName})
              </h2>
              <button
                type="button"
                ref={grantCloseRef}
                onClick={() => setIsGrantModalOpen(false)}
                disabled={isSubmittingGrant}
                className="min-h-11 min-w-11 flex items-center justify-center rounded-lg text-editorial-secondary hover:text-editorial-ivory focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson"
                aria-label="إغلاق نافذة المنح"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {grantError && (
              <div className="mt-4 rounded-lg bg-crimson-subtle border border-crimson/30 p-3 text-xs text-crimson-bright flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{grantError}</span>
              </div>
            )}

            <form onSubmit={handleGrantSubmit} className="mt-4 space-y-4 text-xs">
              {/* اختيار نطاق الاستحقاق (مسلسل كامل أو موسم محدد) */}
              <div>
                <label className="block font-semibold text-editorial-ivory mb-2">
                  نطاق الاستحقاق:
                </label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="grantTargetType"
                      value="SERIES"
                      checked={grantTargetType === 'SERIES'}
                      onChange={() => {
                        setGrantTargetType('SERIES');
                        setSelectedSeasonId('');
                      }}
                      className="accent-crimson"
                    />
                    <span className="text-editorial-ivory">مسلسل كامل (كل المواسم)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="grantTargetType"
                      value="SEASON"
                      checked={grantTargetType === 'SEASON'}
                      onChange={() => setGrantTargetType('SEASON')}
                      className="accent-crimson"
                    />
                    <span className="text-editorial-ivory">موسم محدد فقط</span>
                  </label>
                </div>
              </div>

              {/* اختيار المسلسل */}
              <div>
                <label htmlFor="grant-series-select" className="block font-semibold text-editorial-ivory mb-1">
                  المسلسل المستهدف:
                </label>
                <select
                  id="grant-series-select"
                  value={selectedSeriesId}
                  onChange={(e) => {
                    setSelectedSeriesId(e.target.value);
                    setSelectedSeasonId('');
                  }}
                  className="min-h-11 w-full rounded-lg border border-border-subtle bg-surface px-3 text-xs text-editorial-ivory focus:border-crimson focus:outline-none focus-visible:ring-2 focus-visible:ring-crimson"
                  required
                >
                  <option value="">-- اختر المسلسل --</option>
                  {seriesOptions.map((s) => (
                    <option key={s._id} value={s._id}>
                      {s.title}
                    </option>
                  ))}
                </select>
              </div>

              {/* اختيار الموسم إذا كان النطاق موسم محدد */}
              {grantTargetType === 'SEASON' && (
                <div>
                  <label htmlFor="grant-season-select" className="block font-semibold text-editorial-ivory mb-1">
                    الموسم المستهدف:
                  </label>
                  <select
                    id="grant-season-select"
                    value={selectedSeasonId}
                    onChange={(e) => setSelectedSeasonId(e.target.value)}
                    className="min-h-11 w-full rounded-lg border border-border-subtle bg-surface px-3 text-xs text-editorial-ivory focus:border-crimson focus:outline-none focus-visible:ring-2 focus-visible:ring-crimson"
                    required
                  >
                    <option value="">-- اختر الموسم --</option>
                    {availableSeasons.map((sn) => (
                      <option key={sn._id} value={sn._id}>
                        الموسم {sn.seasonNumber}: {sn.title}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* تاريخ انتهاء الصلاحية (اختياري) */}
              <div>
                <label htmlFor="grant-expiry-input" className="block font-semibold text-editorial-ivory mb-1">
                  تاريخ ووقت انتهاء الصلاحية (اختياري — اتركه فارغاً لصلاحية غير محدودة):
                </label>
                <input
                  id="grant-expiry-input"
                  type="datetime-local"
                  value={grantValidUntil}
                  onChange={(e) => setGrantValidUntil(e.target.value)}
                  className="min-h-11 w-full rounded-lg border border-border-subtle bg-surface px-3 text-xs text-editorial-ivory focus:border-crimson focus:outline-none focus-visible:ring-2 focus-visible:ring-crimson"
                />
              </div>

              {/* سبب المنح / ملاحظة التدقيق */}
              <div>
                <label htmlFor="grant-reason-input" className="block font-semibold text-editorial-ivory mb-1">
                  سبب المنح (لتوثيق سجل التدقيق الإداري):
                </label>
                <input
                  id="grant-reason-input"
                  type="text"
                  value={grantReason}
                  onChange={(e) => setGrantReason(e.target.value)}
                  placeholder="مثال: منحة ترويجية للصحافة، تعويض عن عطل، هدية شريك..."
                  className="min-h-11 w-full rounded-lg border border-border-subtle bg-surface px-3 text-xs text-editorial-ivory focus:border-crimson focus:outline-none focus-visible:ring-2 focus-visible:ring-crimson"
                />
              </div>

              {/* أزرار الإجراء */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-border-subtle">
                <button
                  type="button"
                  onClick={() => setIsGrantModalOpen(false)}
                  disabled={isSubmittingGrant}
                  className="min-h-11 px-4 py-2 rounded-lg border border-border-subtle bg-surface text-editorial-secondary hover:text-editorial-ivory focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingGrant}
                  className="min-h-11 px-5 py-2 rounded-lg bg-crimson hover:bg-crimson-bright text-white font-bold shadow-halo flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson disabled:opacity-50"
                >
                  {isSubmittingGrant && <Loader2 className="h-4 w-4 animate-spin" />}
                  <span>تأكيد المنح</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* نافذة تأكيد إلغاء الاستحقاق */}
      <ConfirmModal
        isOpen={Boolean(revokeTarget)}
        title="إلغاء استحقاق مستخدم"
        message={`هل أنت متأكد من رغبتك في إلغاء هذا الاستحقاق للمستخدم ${activeUser?.displayName || ''}؟ سيفقد المستخدم صلاحية الوصول فوراً.`}
        isDestructive={true}
        isLoading={isRevoking}
        onConfirm={handleConfirmRevoke}
        onClose={() => setRevokeTarget(null)}
      />
    </div>
  );
};
