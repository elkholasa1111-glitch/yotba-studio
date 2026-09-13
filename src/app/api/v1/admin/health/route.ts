// ============================================================
// Protected Admin Infrastructure Health Check - استوديو منصة "يُتبع..."
// فحص حالة الاتصال بقاعدة البيانات وسحابة التخزين للوحة الإدارة
// ============================================================

import { getCurrentAdmin } from '@/lib/auth';
import { checkDatabaseHealth } from '@/lib/db/connect';
import { checkStorageHealth } from '@/lib/storage';
import { isProductionRuntime } from '@/lib/config/runtime';
import { jsonOk, jsonError } from '@/lib/admin/operations-api';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const admin = await getCurrentAdmin();
  if (!admin) {
    return jsonError('غير مصرح لك — يرجى تسجيل الدخول كمسؤول', 401);
  }

  try {
    // A cold serverless instance may need a few seconds to establish the
    // MongoDB TLS/SRV connection.  The database connector itself allows up
    // to 10 seconds, so the health endpoint must not give up at 5 seconds and
    // report a healthy database as "disconnected" while that first connection
    // is still completing.
    const [dbStatus, storageStatus] = await Promise.all([
      checkDatabaseHealth(12000),
      checkStorageHealth(8000),
    ]);

    const isDbOk = dbStatus.configured && dbStatus.connected;
    const isStorageOk = storageStatus.status === 'connected' && storageStatus.connectivity === 'connected';

    const overallStatus = isDbOk ? (isStorageOk ? 'ok' : 'degraded') : 'error';

    return jsonOk({
      status: overallStatus,
      timestamp: new Date().toISOString(),
      mongodb: {
        connected: Boolean(dbStatus.connected),
        latencyMs: dbStatus.latencyMs ?? undefined,
        error: !dbStatus.connected ? dbStatus.status : undefined,
      },
      r2: {
        connected: storageStatus.status === 'connected' && storageStatus.connectivity === 'connected',
        latencyMs: storageStatus.latencyMs ?? undefined,
        error: storageStatus.connectivity !== 'connected' ? storageStatus.status : undefined,
      },
      environment: isProductionRuntime() ? 'production' : (process.env.NODE_ENV || 'development'),
    });
  } catch (error) {
    console.error('Admin health check error:', error);
    return jsonError('فشل فحص الحالة التشغيلية للبنية التحتية', 500);
  }
}
