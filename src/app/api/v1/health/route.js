import { NextResponse } from 'next/server';
import { checkDatabaseHealth } from '@/lib/db/connect';
import { checkStorageHealth } from '@/lib/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const [mongodb, r2Result] = await Promise.all([
    checkDatabaseHealth(10000),
    checkStorageHealth(5000),
  ]);

  return NextResponse.json(
    {
      status: mongodb.connected ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      mongodb,
      r2: {
        connected: r2Result.connectivity === 'connected',
        latencyMs: r2Result.latencyMs,
      },
    },
    {
      headers: {
        'Cache-Control': 'no-store',
      },
    }
  );
}