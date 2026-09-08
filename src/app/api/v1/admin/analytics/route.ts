// ============================================================
// Admin Analytics API — قمع التحويل الحقيقي من أحداث ProductEvent
// ============================================================

import { NextResponse } from 'next/server';
import { getCurrentAdmin } from '@/lib/auth';
import { connectDB } from '@/lib/db/connect';
import { ProductEvent, Purchase, Subscription, User } from '@/lib/db/models';

export async function GET() {
  const admin = await getCurrentAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'غير مصرح لك' }, { status: 401 });
  }

  const conn = await connectDB();
  if (!conn) {
    return NextResponse.json({ error: 'قاعدة البيانات غير متاحة حالياً' }, { status: 503 });
  }

  try {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // آخر 30 يوماً

    // قمع التحويل من الأحداث الفعلية
    const funnelStages = [
      { key: 'SERIES_VIEW', label: '1. مشاهدة صفحة المسلسل (Series View)' },
      { key: 'EPISODE_START', label: '2. بدء استماع الحلقة 1 (Episode Start)' },
      { key: 'EPISODE_25', label: '3. بلوغ 25% من الحلقة (Episode 25%)' },
      { key: 'EPISODE_50', label: '4. بلوغ 50% من الحلقة (Episode 50%)' },
      { key: 'EPISODE_75', label: '5. بلوغ 75% من الحلقة (Episode 75%)' },
      { key: 'EPISODE_COMPLETE', label: '6. إكمال الحلقة (Episode Complete)' },
      { key: 'PAYWALL_VIEW', label: '7. ظهور بوابة الدفع (Paywall View)' },
      { key: 'CHECKOUT_START', label: '8. بدء صفحة الدفع (Checkout Start)' },
    ];

    const counts = await ProductEvent.aggregate([
      { $match: { timestamp: { $gte: since } } },
      { $group: { _id: '$eventName', count: { $sum: 1 } } },
    ]);
    const countMap = new Map(counts.map((c) => [c._id, c.count]));

    const funnel = funnelStages.map((stage) => ({
      stage: stage.label,
      count: countMap.get(stage.key) || 0,
    }));
    const topCount = Math.max(...funnel.map((f) => f.count), 1);
    const funnelWithPercent = funnel.map((f) => ({
      ...f,
      percent: Math.round((f.count / topCount) * 1000) / 10,
    }));

    // عمليات الشراء والاشتراكات الفعلية
    const [paidPurchases, activeSubs, totalUsers, revenueAgg] = await Promise.all([
      Purchase.countDocuments({ status: 'PAID' }),
      Subscription.countDocuments({ status: 'ACTIVE' }),
      User.countDocuments(),
      Purchase.aggregate([
        { $match: { status: 'PAID' } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
    ]);

    return NextResponse.json({
      funnel: funnelWithPercent,
      totals: {
        paidPurchases,
        activeSubs,
        totalUsers,
        totalRevenueUsd: revenueAgg[0]?.total || 0,
        periodDays: 30,
      },
    });
  } catch (error) {
    console.error('Admin analytics error:', error);
    return NextResponse.json({ error: 'فشل جلب التحليلات' }, { status: 500 });
  }
}
