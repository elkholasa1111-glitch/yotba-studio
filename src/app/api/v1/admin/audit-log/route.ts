import { NextResponse } from 'next/server';
import { getCurrentAdmin } from '@/lib/auth';
import { connectDB } from '@/lib/db/connect';
import { AdminAuditLog } from '@/lib/db/models';

// GET: جلب سجل تدقيق الإدارة (الأحدث أولاً)
export async function GET(req: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'غير مصرح لك' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '50'), 1), 100);

  const conn = await connectDB();
  if (!conn) {
    return NextResponse.json({ error: 'قاعدة البيانات غير متاحة حالياً' }, { status: 503 });
  }

  try {
    const logs = await AdminAuditLog.find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('adminUserId', 'displayName email role')
      .lean();

    return NextResponse.json({
      logs: logs.map((log: any) => ({
        _id: log._id.toString(),
        action: log.action,
        targetEntity: log.targetEntity,
        entityId: log.entityId,
        createdAt: log.createdAt,
        actor: log.adminUserId
          ? {
              displayName: log.adminUserId.displayName ?? null,
              email: log.adminUserId.email ?? null,
              role: log.adminUserId.role ?? null,
            }
          : null,
      })),
    });
  } catch (error) {
    console.error('Admin audit log error:', error);
    return NextResponse.json({ error: 'فشل جلب السجل' }, { status: 500 });
  }
}
