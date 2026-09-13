'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Search,
  Filter,
  UserCheck,
  UserX,
  ShieldAlert,
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlertCircle,
  Eye,
  Calendar,
  CreditCard,
  Layers,
  KeyRound,
  X,
  RefreshCw,
} from 'lucide-react';
import { AdminUserDTO, UserDetailData, UserStatus } from './types';
import { fetchUsers, fetchUserDetail, updateUserStatus } from './operations-client';
import { ConfirmModal } from './ConfirmModal';

interface UsersPanelProps {
  onSelectUserForEntitlements?: (user: AdminUserDTO) => void;
  onNotice?: (type: 'success' | 'error', msg: string) => void;
}

const STATUS_CONFIG: Record<
  UserStatus,
  { label: string; bg: string; text: string; border: string }
> = {
  ACTIVE: {
    label: 'نشط',
    bg: 'bg-emerald-950/40',
    text: 'text-emerald-400',
    border: 'border-emerald-800/40',
  },
  SUSPENDED: {
    label: 'معلق',
    bg: 'bg-amber-950/40',
    text: 'text-amber-400',
    border: 'border-amber-800/40',
  },
  BANNED: {
    label: 'محظور',
    bg: 'bg-crimson-subtle',
    text: 'text-crimson-bright',
    border: 'border-crimson/40',
  },
  PENDING_VERIFICATION: {
    label: 'بانتظار التحقق',
    bg: 'bg-blue-950/40',
    text: 'text-blue-400',
    border: 'border-blue-800/40',
  },
};

export const UsersPanel: React.FC<UsersPanelProps> = ({
  onSelectUserForEntitlements,
  onNotice,
}) => {
  const [users, setUsers] = useState<AdminUserDTO[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // نافذة تفاصيل المستخدم
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [userDetail, setUserDetail] = useState<UserDetailData | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // نافذة تأكيد الإجراء
  const [confirmState, setConfirmState] = useState<{
    isOpen: boolean;
    user: AdminUserDTO | null;
    targetStatus: 'ACTIVE' | 'SUSPENDED' | 'BANNED';
    title: string;
    message: string;
  }>({
    isOpen: false,
    user: null,
    targetStatus: 'ACTIVE',
    title: '',
    message: '',
  });
  const [isProcessingAction, setIsProcessingAction] = useState(false);

  const abortControllerRef = useRef<AbortController | null>(null);
  const searchQueryRef = useRef('');
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const detailDialogRef = useRef<HTMLDivElement>(null);
  const detailCloseRef = useRef<HTMLButtonElement>(null);

  // جلب قائمة المستخدمين
  const loadUsers = useCallback(
    async (currentPage: number, query: string, status: string) => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;

      setIsLoading(true);
      setError(null);

      const res = await fetchUsers(
        { page: currentPage, limit, query: query.trim(), status },
        controller.signal
      );

      if (controller.signal.aborted) return;

      setIsLoading(false);
      if (res.ok) {
        setUsers(res.data.users);
        setTotalCount(res.data.pagination.totalCount);
        setTotalPages(res.data.pagination.totalPages);
      } else {
        setError(res.error);
      }
    },
    [limit]
  );

  useEffect(() => {
    // البحث يُدار بالـ debounce أدناه؛ تغيّر الصفحة أو الحالة يعيد استخدام
    // آخر كلمة بحث بدون إطلاق طلب إضافي مع كل حرف يكتبه المشرف.
    loadUsers(page, searchQueryRef.current, statusFilter);
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [page, limit, statusFilter, loadUsers]);

  // البحث مع التهدئة (Debounce)
  const handleSearchChange = (val: string) => {
    setSearchQuery(val);
    searchQueryRef.current = val;
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      setPage(1);
      loadUsers(1, val, statusFilter);
    }, 350);
  };

  // سلوك لوحة التفاصيل: Escape للإغلاق وحصر التركيز داخل النافذة.
  useEffect(() => {
    if (!selectedUserId) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const focusTimer = window.setTimeout(() => detailCloseRef.current?.focus(), 0);

    const handleDetailKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setSelectedUserId(null);
        return;
      }

      if (event.key !== 'Tab') return;
      const dialog = detailDialogRef.current;
      if (!dialog) return;

      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      );
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', handleDetailKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener('keydown', handleDetailKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [selectedUserId]);

  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) window.clearTimeout(searchTimeoutRef.current);
    };
  }, []);

  // فتح تفاصيل المستخدم
  const handleOpenDetail = async (user: AdminUserDTO) => {
    setSelectedUserId(user._id);
    setUserDetail(null);
    setIsLoadingDetail(true);
    setDetailError(null);

    const res = await fetchUserDetail(user._id);
    setIsLoadingDetail(false);
    if (res.ok) {
      setUserDetail(res.data);
    } else {
      setDetailError(res.error);
    }
  };

  // طلب تغيير حالة
  const promptStatusChange = (
    user: AdminUserDTO,
    targetStatus: 'ACTIVE' | 'SUSPENDED' | 'BANNED'
  ) => {
    const titles: Record<string, string> = {
      ACTIVE: 'تنشيط الحساب',
      SUSPENDED: 'تعليق الحساب مؤقتاً',
      BANNED: 'حظر الحساب نهائياً',
    };
    const messages: Record<string, string> = {
      ACTIVE: `هل أنت متأكد من رغبتك في إعادة تنشيط حساب ${user.displayName} (${user.email})؟ سيتمكن من تسجيل الدخول فوراً.`,
      SUSPENDED: `هل أنت متأكد من تعليق حساب ${user.displayName} (${user.email})؟ لن يتمكن من استخدام المنصة أو الاستماع لحين إلغاء التعليق.`,
      BANNED: `تحذير: سيتم حظر المستخدم ${user.displayName} (${user.email}) بشكل كامل ومنعه من الوصول لمنظومة يُتبع بالكامل.`,
    };

    setConfirmState({
      isOpen: true,
      user,
      targetStatus,
      title: titles[targetStatus],
      message: messages[targetStatus],
    });
  };

  // تنفيذ تغيير الحالة
  const handleConfirmStatusChange = async () => {
    if (!confirmState.user) return;
    setIsProcessingAction(true);

    const res = await updateUserStatus(confirmState.user._id, confirmState.targetStatus);
    setIsProcessingAction(false);
    setConfirmState((prev) => ({ ...prev, isOpen: false }));

    if (res.ok) {
      onNotice?.('success', `تم تغيير حالة حساب ${confirmState.user.displayName} بنجاح`);
      // تحديث فوري للقائمة
      setUsers((prev) =>
        prev.map((u) => (u._id === confirmState.user?._id ? { ...u, status: confirmState.targetStatus } : u))
      );
      if (userDetail && userDetail.user._id === confirmState.user._id) {
        setUserDetail({
          ...userDetail,
          user: { ...userDetail.user, status: confirmState.targetStatus },
        });
      }
    } else {
      onNotice?.('error', res.error);
    }
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* شريط البحث والتصفية */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-xl border border-border-subtle bg-surface p-4">
        <div className="relative flex-1">
          <label htmlFor="user-search-input" className="sr-only">
            ابحث بالبريد الإلكتروني أو الاسم
          </label>
          <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-editorial-secondary">
            <Search className="h-4 w-4" aria-hidden="true" />
          </div>
          <input
            id="user-search-input"
            type="search"
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="ابحث بالاسم أو البريد الإلكتروني..."
            className="min-h-11 w-full rounded-lg border border-border-subtle bg-obsidian-850 pr-10 pl-4 text-sm text-editorial-ivory placeholder:text-editorial-secondary/60 focus:border-crimson focus:outline-none focus-visible:ring-2 focus-visible:ring-crimson"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5">
            <Filter className="h-4 w-4 text-editorial-secondary" aria-hidden="true" />
            <label htmlFor="status-filter-select" className="text-xs text-editorial-secondary font-medium">
              الحالة:
            </label>
            <select
              id="status-filter-select"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="min-h-11 rounded-lg border border-border-subtle bg-obsidian-850 px-3 text-xs font-medium text-editorial-ivory focus:border-crimson focus:outline-none focus-visible:ring-2 focus-visible:ring-crimson"
            >
              <option value="ALL">جميع الحالات</option>
              <option value="ACTIVE">نشط</option>
              <option value="SUSPENDED">معلق</option>
              <option value="BANNED">محظور</option>
              <option value="PENDING_VERIFICATION">بانتظار التحقق</option>
            </select>
          </div>

          <button
            type="button"
            onClick={() => loadUsers(page, searchQuery, statusFilter)}
            disabled={isLoading}
            className="min-h-11 min-w-11 flex items-center justify-center rounded-lg border border-border-subtle bg-surface-elevated text-editorial-secondary hover:text-editorial-ivory hover:border-crimson focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson disabled:opacity-50"
            aria-label="تحديث قائمة المستخدمين"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* رسالة الخطأ العامة إن وجدت */}
      {error && (
        <div className="flex items-center gap-3 rounded-xl border border-crimson/30 bg-crimson-subtle p-4 text-sm text-crimson-bright">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <p>{error}</p>
          <button
            type="button"
            onClick={() => loadUsers(page, searchQuery, statusFilter)}
            className="min-h-11 mr-auto px-4 py-1 text-xs font-bold underline hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson rounded"
          >
            إعادة المحاولة
          </button>
        </div>
      )}

      {/* جدول وبطاقات المستخدمين */}
      {isLoading ? (
        <div className="flex min-h-[300px] flex-col items-center justify-center gap-3 rounded-xl border border-border-subtle bg-surface p-8 text-editorial-secondary">
          <Loader2 className="h-8 w-8 animate-spin text-crimson motion-reduce:animate-none" />
          <p className="text-sm font-medium">جاري جلب بيانات المستخدمين بأمان...</p>
        </div>
      ) : users.length === 0 ? (
        <div className="flex min-h-[260px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border-subtle bg-surface p-8 text-center text-editorial-secondary">
          <p className="text-base font-bold text-editorial-ivory">لا يوجد مستخدمون مطابقون</p>
          <p className="text-xs">جرب تغيير معايير البحث أو تصفية الحالات.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border-subtle bg-surface">
          {/* عرض سطح المكتب (جدول) */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead className="border-b border-border-subtle bg-surface-elevated text-xs font-bold text-editorial-secondary">
                <tr>
                  <th scope="col" className="px-4 py-3.5">المستخدم</th>
                  <th scope="col" className="px-4 py-3.5">الحالة</th>
                  <th scope="col" className="px-4 py-3.5">تاريخ التسجيل</th>
                  <th scope="col" className="px-4 py-3.5">النشاط (استحقاقات/شراء)</th>
                  <th scope="col" className="px-4 py-3.5 text-left">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {users.map((user) => {
                  const statusConf = STATUS_CONFIG[user.status] || STATUS_CONFIG.ACTIVE;
                  return (
                    <tr key={user._id} className="hover:bg-surface-elevated/40 transition-colors">
                      <td className="px-4 py-3.5">
                        <div className="font-bold text-editorial-ivory">{user.displayName}</div>
                        <div className="text-xs text-editorial-secondary/80 dir-ltr text-right">
                          {user.email}
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <span
                          className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${statusConf.bg} ${statusConf.text} ${statusConf.border}`}
                        >
                          {statusConf.label}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-xs text-editorial-secondary">
                        {new Date(user.createdAt).toLocaleDateString('ar-EG', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </td>
                      <td className="px-4 py-3.5 text-xs text-editorial-secondary">
                        <span className="font-semibold text-editorial-ivory">
                          {user.activeEntitlementsCount ?? 0}
                        </span>{' '}
                        استحقاق نشط •{' '}
                        <span className="font-semibold text-editorial-ivory">
                          {user.purchasesCount ?? 0}
                        </span>{' '}
                        شراء
                      </td>
                      <td className="px-4 py-3.5 text-left">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => handleOpenDetail(user)}
                            className="min-h-11 px-3 py-1.5 rounded-lg border border-border-subtle bg-surface text-xs font-medium text-editorial-secondary hover:text-editorial-ivory hover:border-editorial-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson inline-flex items-center gap-1.5"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            <span>عرض</span>
                          </button>

                          {user.status === 'ACTIVE' && (
                            <button
                              type="button"
                              onClick={() => promptStatusChange(user, 'SUSPENDED')}
                              className="min-h-11 px-3 py-1.5 rounded-lg border border-amber-800/50 bg-amber-950/20 text-xs font-semibold text-amber-300 hover:bg-amber-950/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 inline-flex items-center gap-1"
                            >
                              <UserX className="h-3.5 w-3.5" />
                              <span>تعليق</span>
                            </button>
                          )}

                          {(user.status === 'SUSPENDED' || user.status === 'PENDING_VERIFICATION') && (
                            <button
                              type="button"
                              onClick={() => promptStatusChange(user, 'ACTIVE')}
                              className="min-h-11 px-3 py-1.5 rounded-lg border border-emerald-800/50 bg-emerald-950/20 text-xs font-semibold text-emerald-300 hover:bg-emerald-950/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 inline-flex items-center gap-1"
                            >
                              <UserCheck className="h-3.5 w-3.5" />
                              <span>تنشيط</span>
                            </button>
                          )}

                          {user.status !== 'BANNED' ? (
                            <button
                              type="button"
                              onClick={() => promptStatusChange(user, 'BANNED')}
                              className="min-h-11 px-3 py-1.5 rounded-lg border border-crimson/50 bg-crimson-subtle text-xs font-semibold text-crimson-bright hover:bg-crimson/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson inline-flex items-center gap-1"
                            >
                              <ShieldAlert className="h-3.5 w-3.5" />
                              <span>حظر</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => promptStatusChange(user, 'ACTIVE')}
                              className="min-h-11 px-3 py-1.5 rounded-lg border border-border-strong bg-surface text-xs font-semibold text-editorial-ivory hover:border-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 inline-flex items-center gap-1"
                            >
                              <UserCheck className="h-3.5 w-3.5" />
                              <span>إلغاء الحظر</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* عرض الهاتف المحمول (بطاقات >= 320px) */}
          <div className="divide-y divide-border-subtle md:hidden">
            {users.map((user) => {
              const statusConf = STATUS_CONFIG[user.status] || STATUS_CONFIG.ACTIVE;
              return (
                <div key={user._id} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-bold text-editorial-ivory text-sm">{user.displayName}</div>
                      <div className="text-xs text-editorial-secondary dir-ltr text-right break-all">
                        {user.email}
                      </div>
                    </div>
                    <span
                      className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${statusConf.bg} ${statusConf.text} ${statusConf.border}`}
                    >
                      {statusConf.label}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs text-editorial-secondary">
                    <span>
                      {user.activeEntitlementsCount ?? 0} استحقاق • {user.purchasesCount ?? 0} شراء
                    </span>
                    <span>
                      {new Date(user.createdAt).toLocaleDateString('ar-EG', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => handleOpenDetail(user)}
                      className="min-h-11 flex-1 px-3 py-1.5 rounded-lg border border-border-subtle bg-surface text-xs font-semibold text-editorial-secondary hover:text-editorial-ivory flex items-center justify-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      <span>التفاصيل</span>
                    </button>

                    {user.status === 'ACTIVE' && (
                      <button
                        type="button"
                        onClick={() => promptStatusChange(user, 'SUSPENDED')}
                        className="min-h-11 flex-1 px-3 py-1.5 rounded-lg border border-amber-800/50 bg-amber-950/20 text-xs font-semibold text-amber-300 flex items-center justify-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
                      >
                        <UserX className="h-3.5 w-3.5" />
                        <span>تعليق</span>
                      </button>
                    )}

                    {(user.status === 'SUSPENDED' || user.status === 'PENDING_VERIFICATION') && (
                      <button
                        type="button"
                        onClick={() => promptStatusChange(user, 'ACTIVE')}
                        className="min-h-11 flex-1 px-3 py-1.5 rounded-lg border border-emerald-800/50 bg-emerald-950/20 text-xs font-semibold text-emerald-300 flex items-center justify-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                      >
                        <UserCheck className="h-3.5 w-3.5" />
                        <span>تنشيط</span>
                      </button>
                    )}

                    {user.status !== 'BANNED' ? (
                      <button
                        type="button"
                        onClick={() => promptStatusChange(user, 'BANNED')}
                        className="min-h-11 flex-1 px-3 py-1.5 rounded-lg border border-crimson/50 bg-crimson-subtle text-xs font-semibold text-crimson-bright flex items-center justify-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson"
                      >
                        <ShieldAlert className="h-3.5 w-3.5" />
                        <span>حظر</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => promptStatusChange(user, 'ACTIVE')}
                        className="min-h-11 flex-1 px-3 py-1.5 rounded-lg border border-border-strong bg-surface text-xs font-semibold text-editorial-ivory flex items-center justify-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                      >
                        <UserCheck className="h-3.5 w-3.5" />
                        <span>إلغاء الحظر</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* الترقيم والتنقل بين الصفحات */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle bg-surface-elevated px-4 py-3">
            <div className="text-xs text-editorial-secondary">
              صفحة <span className="font-bold text-editorial-ivory">{page}</span> من{' '}
              <span className="font-bold text-editorial-ivory">{totalPages}</span> (إجمالي{' '}
              <span className="font-bold text-editorial-ivory">{totalCount}</span> مستخدم)
            </div>

            <div className="flex items-center gap-2">
              <label htmlFor="users-page-limit" className="sr-only">
                عدد النتائج بالصفحة
              </label>
              <select
                id="users-page-limit"
                value={limit}
                onChange={(e) => {
                  setLimit(Number(e.target.value));
                  setPage(1);
                }}
                className="min-h-11 rounded-lg border border-border-subtle bg-surface px-2.5 text-xs text-editorial-ivory focus:border-crimson focus:outline-none focus-visible:ring-2 focus-visible:ring-crimson"
              >
                <option value={10}>10 بالصفحة</option>
                <option value={20}>20 بالصفحة</option>
                <option value={50}>50 بالصفحة</option>
                <option value={100}>100 بالصفحة</option>
              </select>

              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="min-h-11 min-w-11 flex items-center justify-center rounded-lg border border-border-subtle bg-surface text-editorial-secondary hover:text-editorial-ivory disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson"
                aria-label="الصفحة السابقة"
              >
                <ChevronRight className="h-4 w-4" />
              </button>

              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="min-h-11 min-w-11 flex items-center justify-center rounded-lg border border-border-subtle bg-surface text-editorial-secondary hover:text-editorial-ivory disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson"
                aria-label="الصفحة التالية"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* نافذة تفاصيل المستخدم المستقلة */}
      {selectedUserId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-obsidian-950/80 p-4 backdrop-blur-sm"
          role="presentation"
          onClick={() => setSelectedUserId(null)}
        >
          <div
            ref={detailDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="user-detail-title"
            tabIndex={-1}
            className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl border border-border-strong bg-surface-modal p-6 text-right shadow-cinematic"
            onClick={(e) => e.stopPropagation()}
            dir="rtl"
          >
            <div className="flex items-center justify-between border-b border-border-subtle pb-4">
              <h2 id="user-detail-title" className="text-lg font-bold text-editorial-ivory">
                تفاصيل المستخدم
              </h2>
              <button
                type="button"
                ref={detailCloseRef}
                onClick={() => setSelectedUserId(null)}
                className="min-h-11 min-w-11 flex items-center justify-center rounded-lg text-editorial-secondary hover:bg-surface-elevated hover:text-editorial-ivory focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson"
                aria-label="إغلاق تفاصيل المستخدم"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {isLoadingDetail ? (
              <div className="flex min-h-[200px] items-center justify-center">
                <Loader2 className="h-7 w-7 animate-spin text-crimson" />
              </div>
            ) : detailError ? (
              <div className="my-6 rounded-lg bg-crimson-subtle p-4 text-sm text-crimson-bright">
                {detailError}
              </div>
            ) : userDetail ? (
              <div className="mt-4 space-y-6">
                {/* الملف الشخصي الآمن */}
                <div className="rounded-lg border border-border-subtle bg-surface p-4 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-bold text-base text-editorial-ivory">
                      {userDetail.user.displayName}
                    </span>
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                        STATUS_CONFIG[userDetail.user.status]?.bg || ''
                      } ${STATUS_CONFIG[userDetail.user.status]?.text || ''}`}
                    >
                      {STATUS_CONFIG[userDetail.user.status]?.label || userDetail.user.status}
                    </span>
                  </div>
                  <div className="text-xs text-editorial-secondary dir-ltr text-right">
                    {userDetail.user.email}
                  </div>
                  <div className="flex flex-wrap items-center gap-4 pt-2 text-xs text-editorial-secondary border-t border-border-subtle/50">
                    <span>
                      البريد موثّق:{' '}
                      <strong className="text-editorial-ivory">
                        {userDetail.user.emailVerified ? 'نعم' : 'لا'}
                      </strong>
                    </span>
                    <span>
                      تاريخ الانضمام:{' '}
                      <strong className="text-editorial-ivory">
                        {new Date(userDetail.user.createdAt).toLocaleDateString('ar-EG')}
                      </strong>
                    </span>
                  </div>
                </div>

                {/* زر نقل سريع لإدارة الاستحقاقات */}
                {onSelectUserForEntitlements && (
                  <button
                    type="button"
                    onClick={() => {
                      onSelectUserForEntitlements(userDetail.user);
                      setSelectedUserId(null);
                    }}
                    className="min-h-11 w-full rounded-lg border border-crimson/50 bg-crimson-subtle px-4 py-2.5 text-xs font-bold text-crimson-bright hover:bg-crimson/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson flex items-center justify-center gap-2"
                  >
                    <KeyRound className="h-4 w-4" />
                    <span>إدارة ومنح الاستحقاقات لهذا المستخدم</span>
                  </button>
                )}

                {/* قائمة الاستحقاقات الحالية */}
                <div>
                  <h3 className="text-sm font-bold text-editorial-ivory mb-2 flex items-center gap-2">
                    <Layers className="h-4 w-4 text-crimson" />
                    <span>الاستحقاقات ({userDetail.entitlements.length})</span>
                  </h3>
                  {userDetail.entitlements.length === 0 ? (
                    <p className="text-xs text-editorial-secondary bg-surface p-3 rounded-lg border border-border-subtle">
                      لا توجد استحقاقات مسجلة لهذا الحساب.
                    </p>
                  ) : (
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {userDetail.entitlements.map((ent) => (
                        <div
                          key={ent._id}
                          className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-lg border border-border-subtle bg-surface text-xs"
                        >
                          <div>
                            <div className="font-semibold text-editorial-ivory">
                              {ent.targetSeries?.title || ent.targetSeason?.title || 'استحقاق عام'}
                            </div>
                            <div className="text-[11px] text-editorial-secondary">
                              النوع: {ent.type} • المصدر: {ent.source}
                            </div>
                          </div>
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                              ent.isActive
                                ? 'bg-emerald-950/40 text-emerald-400'
                                : 'bg-surface-elevated text-editorial-secondary line-through'
                            }`}
                          >
                            {ent.isActive ? 'نشط' : 'ملغى'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* المشتريات */}
                <div>
                  <h3 className="text-sm font-bold text-editorial-ivory mb-2 flex items-center gap-2">
                    <CreditCard className="h-4 w-4 text-crimson" />
                    <span>سجل المشتريات ({userDetail.purchases.length})</span>
                  </h3>
                  {userDetail.purchases.length === 0 ? (
                    <p className="text-xs text-editorial-secondary bg-surface p-3 rounded-lg border border-border-subtle">
                      لا توجد عمليات شراء مكتملة.
                    </p>
                  ) : (
                    <div className="space-y-2 max-h-40 overflow-y-auto">
                      {userDetail.purchases.map((pur) => (
                        <div
                          key={pur._id}
                          className="flex items-center justify-between p-2.5 rounded-lg border border-border-subtle bg-surface text-xs"
                        >
                          <div>
                            <div className="font-semibold text-editorial-ivory">
                              طلب #{pur.orderNumber}
                            </div>
                            <div className="text-[11px] text-editorial-secondary">
                              {pur.amount} {pur.currency} • {pur.status}
                            </div>
                          </div>
                          <span className="text-[11px] text-editorial-secondary">
                            {new Date(pur.createdAt).toLocaleDateString('ar-EG')}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* الاشتراكات */}
                {userDetail.subscriptions.length > 0 && (
                  <div>
                    <h3 className="text-sm font-bold text-editorial-ivory mb-2 flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-crimson" />
                      <span>الاشتراكات ({userDetail.subscriptions.length})</span>
                    </h3>
                    <div className="space-y-2 max-h-40 overflow-y-auto">
                      {userDetail.subscriptions.map((sub) => (
                        <div
                          key={sub._id}
                          className="flex items-center justify-between p-2.5 rounded-lg border border-border-subtle bg-surface text-xs"
                        >
                          <div>
                            <div className="font-semibold text-editorial-ivory">
                              خطة {sub.plan} ({sub.status})
                            </div>
                            <div className="text-[11px] text-editorial-secondary">
                              تنتهي في:{' '}
                              {new Date(sub.currentPeriodEnd).toLocaleDateString('ar-EG')}
                            </div>
                          </div>
                          <span className="font-bold text-editorial-ivory">
                            {sub.price} {sub.currency}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* نافذة تأكيد الإجراء */}
      <ConfirmModal
        isOpen={confirmState.isOpen}
        title={confirmState.title}
        message={confirmState.message}
        isDestructive={confirmState.targetStatus === 'BANNED'}
        isLoading={isProcessingAction}
        onConfirm={handleConfirmStatusChange}
        onClose={() => setConfirmState((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
};
