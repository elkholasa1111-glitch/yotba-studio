import { AdminUser } from "@/lib/db/models";
import { connectDB } from "@/lib/db/connect";
import { getCurrentAdmin, hashPassword } from "@/lib/auth";
import {
  jsonError,
  jsonOk,
  writeOperationsAudit,
} from "@/lib/admin/operations-api";
import {
  createTeamService,
  requireTeamOwner,
  TeamError,
  type TeamMember,
} from "@/lib/admin/team-service";
import { isSameOriginAdminMutation } from "@/lib/admin/access";

export const dynamic = "force-dynamic";
const FIELDS = "_id email displayName role status lastLoginAt createdAt";
const team = createTeamService({
  list: async () =>
    (await AdminUser.find({})
      .select(FIELDS)
      .sort({ createdAt: 1 })
      .lean()) as unknown as TeamMember[],
  find: async (id) =>
    (await AdminUser.findById(id)
      .select(FIELDS)
      .lean()) as unknown as TeamMember | null,
  protectedOwnerId: async () => {
    // The original owner is the first full administrator. API-created members
    // cannot set _id/createdAt, so adding another full admin cannot replace it.
    const owner = await AdminUser.findOne({ role: "SUPER_ADMIN" })
      .sort({ _id: 1 })
      .select("_id");
    return owner ? String(owner._id) : null;
  },
  create: async (data) =>
    (await AdminUser.create(data)).toObject() as unknown as TeamMember,
  update: async (id, changes, protectedOwnerId) =>
    (await AdminUser.findOneAndUpdate(
      { _id: { $eq: id, $ne: protectedOwnerId } },
      { $set: changes, $inc: { sessionVersion: 1 } },
      { new: true, runValidators: true },
    )
      .select(FIELDS)
      .lean()) as unknown as TeamMember | null,
  hashPassword,
  audit: async (adminUserId, action, member, previous) =>
    writeOperationsAudit({
      adminUserId,
      action,
      targetEntity: "AdminUser",
      entityId: member._id,
      previousState: previous ? { ...previous } : undefined,
      newState: { ...member },
    }),
});

async function handle(req: Request, method: "GET" | "POST" | "PATCH") {
  try {
    const admin = await getCurrentAdmin();
    requireTeamOwner(admin);
    let body: unknown;
    if (method !== "GET") {
      if (!isSameOriginAdminMutation(req))
        return jsonError("مصدر الطلب غير مسموح به", 403);
      if (
        !req.headers
          .get("content-type")
          ?.toLowerCase()
          .includes("application/json")
      )
        return jsonError("نوع المحتوى يجب أن يكون application/json", 415);
      const text = await req.text();
      if (new TextEncoder().encode(text).length > 8192)
        return jsonError("حجم الطلب كبير جدًا", 413);
      try {
        body = JSON.parse(text);
      } catch {
        return jsonError("صيغة البيانات غير صالحة", 400);
      }
    }
    if (!(await connectDB()))
      return jsonError("قاعدة البيانات غير متاحة الآن. أعد المحاولة", 503);
    if (method === "GET") return jsonOk(await team.list(admin));
    if (method === "POST") return jsonOk(await team.create(admin, body), 201);
    return jsonOk(await team.update(admin, body));
  } catch (error) {
    if (error instanceof TeamError)
      return jsonError(error.message, error.status);
    if (
      typeof error === "object" &&
      error &&
      "code" in error &&
      error.code === 11000
    )
      return jsonError("هذا البريد مسجل بالفعل في فريق الاستوديو", 409);
    // Do not log database validation errors: they may contain credential fields.
    console.error("Team management request failed", { method });
    return jsonError("تعذر إتمام الطلب. حدّث القائمة وأعد المحاولة", 500);
  }
}
export async function GET(req: Request) {
  return handle(req, "GET");
}
export async function POST(req: Request) {
  return handle(req, "POST");
}
export async function PATCH(req: Request) {
  return handle(req, "PATCH");
}
