// ============================================================
// Typed Operations API Client
// عميل الاستدعاء البرمجي لعمليات الإدارة مع دعم إلغاء الطلبات المتأخرة
// ============================================================

import {
  ApiResponse,
  AdminUserDTO,
  UserPagination,
  UserDetailData,
  AdminHomepageSectionDTO,
  SeriesOption,
  AdminEntitlementDTO,
} from './types';

async function adminFetch<T>(url: string, init?: RequestInit): Promise<ApiResponse<T>> {
  try {
    const res = await fetch(url, {
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers || {}),
      },
      ...init,
    });

    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      return { ok: true, data: data as T };
    }

    const errorMsg =
      data && typeof data === 'object' && typeof (data as any).error === 'string'
        ? (data as any).error
        : 'حدث خطأ غير متوقع في الخادم';

    return { ok: false, status: res.status, error: errorMsg };
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      return { ok: false, status: 0, error: 'تم إلغاء الطلب' };
    }
    return { ok: false, status: 0, error: 'تعذر الاتصال بالخادم. يرجى التحقق من اتصالك والمحاولة مجدداً.' };
  }
}

// ---------------- المستخدمون ----------------

export async function fetchUsers(
  params: { page?: number; limit?: number; query?: string; status?: string },
  signal?: AbortSignal
): Promise<ApiResponse<{ users: AdminUserDTO[]; pagination: UserPagination }>> {
  const query = new URLSearchParams();
  if (params.page) query.set('page', String(params.page));
  if (params.limit) query.set('limit', String(params.limit));
  if (params.query) query.set('query', params.query);
  if (params.status && params.status !== 'ALL') query.set('status', params.status);

  return adminFetch(`/api/v1/admin/users?${query.toString()}`, { signal });
}

export async function fetchUserDetail(
  userId: string,
  signal?: AbortSignal
): Promise<ApiResponse<UserDetailData>> {
  return adminFetch(`/api/v1/admin/users/${encodeURIComponent(userId)}`, { signal });
}

export async function updateUserStatus(
  userId: string,
  status: string,
  reason?: string
): Promise<ApiResponse<{ success: boolean; user: AdminUserDTO }>> {
  return adminFetch('/api/v1/admin/users', {
    method: 'PATCH',
    body: JSON.stringify({ userId, status, reason }),
  });
}

// ---------------- الاستحقاقات ----------------

export async function fetchEntitlements(
  userId?: string,
  catalog: boolean = false,
  signal?: AbortSignal
): Promise<
  ApiResponse<{
    seriesOptions: SeriesOption[];
    user?: AdminUserDTO;
    entitlements: AdminEntitlementDTO[];
    purchases: any[];
    subscriptions: any[];
  }>
> {
  const query = new URLSearchParams();
  if (userId) query.set('userId', userId);
  if (catalog) query.set('catalog', 'true');

  return adminFetch(`/api/v1/admin/entitlements?${query.toString()}`, { signal });
}

export async function grantEntitlement(data: {
  userId: string;
  targetSeriesId?: string;
  targetSeasonId?: string;
  validUntil?: string | null;
  reason?: string;
}): Promise<ApiResponse<{ success: boolean; entitlement: any }>> {
  return adminFetch('/api/v1/admin/entitlements', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function revokeEntitlement(
  entitlementId: string
): Promise<ApiResponse<{ success: boolean; message: string }>> {
  return adminFetch(`/api/v1/admin/entitlements?id=${encodeURIComponent(entitlementId)}`, {
    method: 'DELETE',
  });
}

// ---------------- أقسام الرئيسية ----------------

export async function fetchHomepageSections(
  signal?: AbortSignal
): Promise<
  ApiResponse<{
    sections: AdminHomepageSectionDTO[];
    seriesOptions: SeriesOption[];
  }>
> {
  return adminFetch('/api/v1/admin/homepage', { signal });
}

export async function createHomepageSection(
  data: Record<string, unknown>
): Promise<ApiResponse<{ success: boolean; section: AdminHomepageSectionDTO }>> {
  return adminFetch('/api/v1/admin/homepage', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateHomepageSection(
  sectionId: string,
  data: Record<string, unknown>
): Promise<ApiResponse<{ success: boolean; section: AdminHomepageSectionDTO }>> {
  return adminFetch('/api/v1/admin/homepage', {
    method: 'PATCH',
    body: JSON.stringify({ sectionId, ...data }),
  });
}

export async function reorderHomepageSections(
  orders: Array<{ id: string; order: number }>
): Promise<ApiResponse<{ success: boolean; sections: AdminHomepageSectionDTO[] }>> {
  return adminFetch('/api/v1/admin/homepage', {
    method: 'PATCH',
    body: JSON.stringify({ action: 'reorder', orders }),
  });
}

export async function deleteHomepageSection(
  sectionId: string
): Promise<ApiResponse<{ success: boolean; deletedId: string }>> {
  return adminFetch(`/api/v1/admin/homepage?id=${encodeURIComponent(sectionId)}`, {
    method: 'DELETE',
  });
}
