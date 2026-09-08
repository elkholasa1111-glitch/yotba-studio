import { NextResponse } from 'next/server';
import { clearAuthCookie } from '@/lib/auth';

export async function POST() {
  clearAuthCookie(true);
  return NextResponse.json({ success: true });
}
