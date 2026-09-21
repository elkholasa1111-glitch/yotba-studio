export type TeamActor = { userId: string; role: string };
export type TeamMember = {
  _id: string;
  email: string;
  displayName: string;
  role: string;
  status: string;
  lastLoginAt?: Date | string;
  createdAt?: Date | string;
};
type MemberChanges = {
  displayName?: string;
  role?: string;
  status?: string;
  passwordHash?: string;
};
export interface TeamDependencies {
  list(): Promise<TeamMember[]>;
  find(id: string): Promise<TeamMember | null>;
  protectedOwnerId(): Promise<string | null>;
  create(data: {
    email: string;
    displayName: string;
    role: string;
    status: string;
    passwordHash: string;
  }): Promise<TeamMember>;
  // Atomically exclude the protected owner and revoke all previous sessions.
  update(
    id: string,
    changes: MemberChanges,
    protectedOwnerId: string | null,
  ): Promise<TeamMember | null>;
  hashPassword(password: string): Promise<string>;
  audit(
    actorId: string,
    action: string,
    member: TeamMember,
    previous?: TeamMember,
  ): Promise<void>;
}
export class TeamError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function requireTeamOwner(
  actor: TeamActor | null,
): asserts actor is TeamActor {
  if (!actor) throw new TeamError(401, "سجّل الدخول إلى الاستوديو أولاً");
  if (actor.role !== "SUPER_ADMIN")
    throw new TeamError(403, "إدارة الفريق متاحة للمدير كامل الصلاحيات فقط");
}
function validateBody(
  value: unknown,
  editing: boolean,
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TeamError(400, "بيانات الطلب غير صالحة");
  const body = value as Record<string, unknown>;
  const allowed = editing
    ? ["id", "displayName", "role", "status", "password"]
    : ["email", "displayName", "role", "password"];
  if (Object.keys(body).some((key) => !allowed.includes(key)))
    throw new TeamError(400, "الطلب يحتوي على حقول غير مسموح بها");
  if (editing && Object.keys(body).length < 2)
    throw new TeamError(400, "اختر البيانات التي تريد تعديلها");
  return body;
}
function name(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.trim().length < 2 ||
    value.trim().length > 80 ||
    /[<>\u0000-\u001f\u007f]/.test(value)
  )
    throw new TeamError(
      400,
      "الاسم يجب أن يكون من حرفين إلى 80 حرفًا بدون رموز HTML",
    );
  return value.trim();
}
function role(value: unknown): string {
  if (
    value !== "ADMIN" &&
    value !== "CONTENT_EDITOR" &&
    value !== "SUPER_ADMIN"
  )
    throw new TeamError(400, "اختر صلاحية صحيحة لعضو الفريق");
  return value;
}
function password(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length < 12 ||
    new TextEncoder().encode(value).length > 72 ||
    !/\p{L}/u.test(value) ||
    !/\p{N}/u.test(value) ||
    /[\u0000-\u001f\u007f]/.test(value)
  )
    throw new TeamError(
      400,
      "استخدم كلمة مرور من 12 حرفًا على الأقل بها حروف وأرقام، ولا تتجاوز 72 بايت",
    );
  return value;
}
export function publicTeamMember(member: TeamMember): TeamMember {
  return {
    _id: String(member._id),
    email: member.email,
    displayName: member.displayName,
    role: member.role,
    status: member.status,
    lastLoginAt: member.lastLoginAt,
    createdAt: member.createdAt,
  };
}
export function createTeamService(deps: TeamDependencies) {
  return {
    async list(actor: TeamActor | null) {
      requireTeamOwner(actor);
      const [members, protectedOwnerId] = await Promise.all([
        deps.list(),
        deps.protectedOwnerId(),
      ]);
      return {
        members: members.map(publicTeamMember),
        currentAdminId: actor.userId,
        protectedOwnerId,
      };
    },
    async create(actor: TeamActor | null, input: unknown) {
      requireTeamOwner(actor);
      const body = validateBody(input, false);
      if (
        typeof body.email !== "string" ||
        body.email.length > 254 ||
        !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(body.email.trim()) ||
        /[\u0000-\u001f\u007f]/.test(body.email)
      )
        throw new TeamError(400, "أدخل بريدًا إلكترونيًا صالحًا");
      const data = {
        email: body.email.trim().toLowerCase(),
        displayName: name(body.displayName),
        role: role(body.role),
        status: "ACTIVE",
        passwordHash: await deps.hashPassword(password(body.password)),
      };
      const member = publicTeamMember(await deps.create(data));
      await deps.audit(actor.userId, "TEAM_MEMBER_CREATED", member);
      return { member };
    },
    async update(actor: TeamActor | null, input: unknown) {
      requireTeamOwner(actor);
      const body = validateBody(input, true);
      if (typeof body.id !== "string" || !/^[a-f0-9]{24}$/i.test(body.id))
        throw new TeamError(400, "معرّف العضو غير صالح");
      if (body.id.toLowerCase() === actor.userId.toLowerCase())
        throw new TeamError(
          403,
          "لا يمكن تعديل حساب صاحب المنصة من إدارة الفريق",
        );
      const protectedOwnerId = await deps.protectedOwnerId();
      if (!protectedOwnerId)
        throw new TeamError(
          409,
          "تعذر التحقق من حساب صاحب المنصة. أعد المحاولة",
        );
      if (body.id.toLowerCase() === protectedOwnerId.toLowerCase())
        throw new TeamError(
          403,
          "حساب صاحب المنصة الأساسي محمي من التعديل والإيقاف",
        );
      const member = await deps.find(body.id);
      if (!member) throw new TeamError(404, "عضو الفريق غير موجود");
      const changes: MemberChanges = {};
      if ("displayName" in body) changes.displayName = name(body.displayName);
      if ("role" in body) changes.role = role(body.role);
      if ("status" in body) {
        if (body.status !== "ACTIVE" && body.status !== "SUSPENDED")
          throw new TeamError(400, "حالة الحساب غير صالحة");
        changes.status = body.status;
      }
      if ("password" in body)
        changes.passwordHash = await deps.hashPassword(password(body.password));
      const updated = await deps.update(body.id, changes, protectedOwnerId);
      if (!updated)
        throw new TeamError(
          409,
          "تغير الحساب أثناء الحفظ. حدّث القائمة وأعد المحاولة",
        );
      const safeMember = publicTeamMember(updated);
      await deps.audit(
        actor.userId,
        "TEAM_MEMBER_UPDATED",
        safeMember,
        publicTeamMember(member),
      );
      return { member: safeMember };
    },
  };
}
