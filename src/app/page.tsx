import React from 'react';
import { redirect } from 'next/navigation';
import { AdminDashboardView } from '@/components/admin/AdminDashboardView';
import { getCurrentAdmin } from '@/lib/auth';

export const metadata = {
  title: 'استوديو يُتبع... | لوحة التحكم والإنتاج',
  description: 'لوحة التحكم والإنتاج وإدارة المحتوى الصوتي لمنصة يُتبع...',
};

export default async function StudioHomePage() {
  const admin = await getCurrentAdmin();
  if (!admin) {
    redirect('/login');
  }
  return <AdminDashboardView />;
}
