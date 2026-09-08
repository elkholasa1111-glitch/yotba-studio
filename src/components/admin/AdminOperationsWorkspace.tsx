'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  Users,
  KeyRound,
  LayoutGrid,
  CheckCircle2,
  AlertCircle,
  X,
} from 'lucide-react';
import { AdminUserDTO } from './operations/types';
import { UsersPanel } from './operations/UsersPanel';
import { EntitlementsPanel } from './operations/EntitlementsPanel';
import { HomepagePanel } from './operations/HomepagePanel';

export interface AdminOperationsWorkspaceProps {
  onNotice?: (type: 'success' | 'error', msg: string) => void;
  onRefresh?: () => Promise<void>;
}

type TabKey = 'users' | 'entitlements' | 'homepage';

interface TabItem {
  key: TabKey;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
}

const TABS: TabItem[] = [
  {
    key: 'users',
    label: 'المستخدمون',
    icon: Users,
    description: 'إدارة دورة حياة الحسابات، البحث الآمن، وحالات التنشيط والتعليق والحظر',
  },
  {
    key: 'entitlements',
    label: 'الاستحقاقات',
    icon: KeyRound,
    description: 'استعراض صلاحيات الوصول ومنح وإلغاء الاستحقاقات الإدارية للمسلسلات والمواسم',
  },
  {
    key: 'homepage',
    label: 'أقسام الصفحة الرئيسية',
    icon: LayoutGrid,
    description: 'ترتيب وجدولة أقسام الواجهة الرئيسية وضبط قواعد التغذية الذكية',
  },
];

export const AdminOperationsWorkspace: React.FC<AdminOperationsWorkspaceProps> = ({
  onNotice: externalNotice,
  onRefresh,
}) => {
  const [activeTab, setActiveTab] = useState<TabKey>('users');
  const [selectedUserForEntitlements, setSelectedUserForEntitlements] =
    useState<AdminUserDTO | null>(null);

  // إشعارات داخلية مستقلة في حال لم يمرر المستضيف دالة إشعار خارجية
  const [notice, setNotice] = useState<{
    id: number;
    type: 'success' | 'error';
    msg: string;
  } | null>(null);

  const tabRefs = useRef<Record<TabKey, HTMLButtonElement | null>>({
    users: null,
    entitlements: null,
    homepage: null,
  });

  const handleShowNotice = (type: 'success' | 'error', msg: string) => {
    if (externalNotice) {
      externalNotice(type, msg);
      return;
    }
    setNotice({ id: Date.now(), type, msg });
  };

  // إخفاء الإشعار الداخلي تلقائياً بعد 6 ثوانٍ
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => {
      setNotice((current) => (current?.id === notice.id ? null : current));
    }, 6000);
    return () => clearTimeout(timer);
  }, [notice]);

  // الانتقال بين التبويبات بالأسهم (Accessible Tabs Pattern: Arrow Navigation)
  const handleTabKeyDown = (e: React.KeyboardEvent, index: number) => {
    const tabKeys: TabKey[] = ['users', 'entitlements', 'homepage'];
    let targetIndex = index;

    if (e.key === 'ArrowLeft') {
      targetIndex = (index + 1) % tabKeys.length;
    } else if (e.key === 'ArrowRight') {
      targetIndex = (index - 1 + tabKeys.length) % tabKeys.length;
    } else if (e.key === 'Home') {
      targetIndex = 0;
    } else if (e.key === 'End') {
      targetIndex = tabKeys.length - 1;
    } else {
      return;
    }

    e.preventDefault();
    const nextKey = tabKeys[targetIndex];
    setActiveTab(nextKey);
    tabRefs.current[nextKey]?.focus();
  };

  // عند النقر على "إدارة استحقاقات هذا المستخدم" من جدول المستخدمين
  const handleSelectUserFromUsersList = (user: AdminUserDTO) => {
    setSelectedUserForEntitlements(user);
    setActiveTab('entitlements');
    handleShowNotice('success', `تم تحديد المستخدم "${user.displayName}" لإدارة استحقاقاته`);
  };

  return (
    <div className="w-full max-w-7xl mx-auto px-3 sm:px-6 py-6 space-y-6 font-ui" dir="rtl">
      {/* الترويسة الرئيسية لمنطقة العمليات */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-border-subtle pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-2.5 w-2.5 rounded-full bg-crimson shadow-halo" aria-hidden="true" />
            <h1 className="text-xl sm:text-2xl font-black font-display text-editorial-ivory tracking-tight">
              لوحة عمليات الإدارة
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-editorial-secondary mt-1">
            إدارة المستخدمين والاستحقاقات الإدارية وهيكلية الصفحة الرئيسية لمنصة يُتبع.
          </p>
        </div>

        {onRefresh && (
          <button
            type="button"
            onClick={() => onRefresh()}
            className="min-h-11 px-4 py-2 rounded-lg border border-border-subtle bg-surface text-xs font-semibold text-editorial-secondary hover:text-editorial-ivory hover:border-crimson focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson self-start sm:self-auto"
          >
            تحديث شامل
          </button>
        )}
      </div>

      {/* شريط الإشعارات المستقل */}
      {notice && (
        <div
          role="status"
          aria-live="polite"
          className={`flex items-center justify-between gap-3 rounded-xl border p-4 text-xs sm:text-sm font-semibold transition-all motion-safe:animate-fade-in ${
            notice.type === 'success'
              ? 'border-emerald-800/40 bg-emerald-950/40 text-emerald-300'
              : 'border-crimson/40 bg-crimson-subtle text-crimson-bright'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {notice.type === 'success' ? (
              <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />
            ) : (
              <AlertCircle className="h-5 w-5 shrink-0 text-crimson-bright" />
            )}
            <span>{notice.msg}</span>
          </div>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="min-h-11 min-w-11 flex items-center justify-center rounded-lg text-editorial-secondary hover:text-editorial-ivory focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson"
            aria-label="إغلاق الإشعار"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* شريط التبويبات المتوافق مع معايير الوصول (ARIA Tablist) */}
      <div className="border-b border-border-subtle">
        <div
          role="tablist"
          aria-label="أقسام عمليات الإدارة"
          className="flex flex-wrap gap-2 sm:gap-4 -mb-px"
        >
          {TABS.map((tab, idx) => {
            const isSelected = activeTab === tab.key;
            const Icon = tab.icon;

            return (
              <button
                key={tab.key}
                ref={(el) => {
                  tabRefs.current[tab.key] = el;
                }}
                role="tab"
                id={`tab-${tab.key}`}
                aria-controls={`tabpanel-${tab.key}`}
                aria-selected={isSelected}
                tabIndex={isSelected ? 0 : -1}
                onClick={() => setActiveTab(tab.key)}
                onKeyDown={(e) => handleTabKeyDown(e, idx)}
                className={`min-h-11 px-4 py-3 rounded-t-lg border-b-2 text-xs sm:text-sm font-bold flex items-center gap-2.5 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson focus-visible:ring-offset-2 focus-visible:ring-offset-obsidian ${
                  isSelected
                    ? 'border-crimson text-editorial-ivory bg-surface'
                    : 'border-transparent text-editorial-secondary hover:text-editorial-ivory hover:border-border-strong'
                }`}
              >
                <Icon
                  className={`h-4 w-4 ${
                    isSelected ? 'text-crimson' : 'text-editorial-secondary'
                  }`}
                />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* محتوى التبويبات (ARIA Tabpanels) */}
      <div>
        {/* تبويب المستخدمين */}
        <div
          role="tabpanel"
          id="tabpanel-users"
          aria-labelledby="tab-users"
          hidden={activeTab !== 'users'}
          className={activeTab === 'users' ? 'block' : 'hidden'}
        >
          {activeTab === 'users' && (
            <UsersPanel
              onSelectUserForEntitlements={handleSelectUserFromUsersList}
              onNotice={handleShowNotice}
            />
          )}
        </div>

        {/* تبويب الاستحقاقات */}
        <div
          role="tabpanel"
          id="tabpanel-entitlements"
          aria-labelledby="tab-entitlements"
          hidden={activeTab !== 'entitlements'}
          className={activeTab === 'entitlements' ? 'block' : 'hidden'}
        >
          {activeTab === 'entitlements' && (
            <EntitlementsPanel
              selectedUser={selectedUserForEntitlements}
              onNotice={handleShowNotice}
            />
          )}
        </div>

        {/* تبويب أقسام الصفحة الرئيسية */}
        <div
          role="tabpanel"
          id="tabpanel-homepage"
          aria-labelledby="tab-homepage"
          hidden={activeTab !== 'homepage'}
          className={activeTab === 'homepage' ? 'block' : 'hidden'}
        >
          {activeTab === 'homepage' && (
            <HomepagePanel onNotice={handleShowNotice} />
          )}
        </div>
      </div>
    </div>
  );
};
