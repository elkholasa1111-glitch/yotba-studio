import { getCurrentAdmin } from '@/lib/auth';
import { jsonOk } from '@/lib/admin/operations-api';

export const dynamic = 'force-dynamic';

export async function GET() {
  const admin = await getCurrentAdmin();
  if (!admin) {
    return jsonOk({ admin: null });
  }

  return jsonOk({
    admin: {
      userId: admin.userId,
      email: admin.email,
      displayName: admin.displayName,
      role: admin.role,
    },
  });
}
