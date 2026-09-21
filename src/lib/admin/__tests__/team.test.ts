import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { createTeamService, TeamError, type TeamMember } from "../team-service";
import {
  canAccessAdminSection,
  isCurrentAdminSession,
  safeAdminReturnTo,
  isSameOriginAdminMutation,
} from "../access";

async function main() {
  const owner = { userId: "100000000000000000000001", role: "SUPER_ADMIN" };
  type Stored = TeamMember & { passwordHash: string; sessionVersion: number };
  const records = new Map<string, Stored>();
  records.set(owner.userId, {
    _id: owner.userId,
    email: "owner@example.com",
    displayName: "Owner",
    role: "SUPER_ADMIN",
    status: "ACTIVE",
    passwordHash: "never-expose",
    sessionVersion: 0,
  });
  const audit: unknown[] = [];
  let count = 1;
  const service = createTeamService({
    list: async () => [...records.values()],
    find: async (id) => records.get(id) || null,
    protectedOwnerId: async () => owner.userId,
    create: async (data) => {
      if ([...records.values()].some((record) => record.email === data.email))
        throw Object.assign(new Error("duplicate"), { code: 11000 });
      const item = {
        ...data,
        _id: (++count).toString(16).padStart(24, "0"),
        sessionVersion: 0,
      };
      records.set(item._id, item);
      return item;
    },
    update: async (id, changes, protectedOwnerId) => {
      const current = records.get(id);
      if (!current || id === protectedOwnerId) return null;
      const updated = {
        ...current,
        ...changes,
        sessionVersion: current.sessionVersion + 1,
      };
      records.set(id, updated);
      return updated;
    },
    hashPassword: (value) => bcrypt.hash(value, 4),
    audit: async (...entry) => {
      audit.push(entry);
    },
  });
  const input = {
    email: " Editor@Example.com ",
    displayName: " محرر تجريبي ",
    password: "Example-test-2026",
    role: "CONTENT_EDITOR",
  };
  const fails = (operation: Promise<unknown>, status: number) =>
    assert.rejects(
      operation,
      (error) => error instanceof TeamError && error.status === status,
    );

  for (const role of [
    "ADMIN",
    "CONTENT_EDITOR",
    "MODERATOR",
    "ANALYTICS_VIEWER",
    "USER",
  ]) {
    const actor = { ...owner, role };
    await fails(service.list(actor), 403);
    await fails(service.create(actor, input), 403);
    await fails(
      service.update(actor, { id: owner.userId, status: "SUSPENDED" }),
      403,
    );
  }
  await fails(service.list(null), 401);
  await fails(service.create(null, input), 401);
  for (const invalid of [
    null,
    [],
    { ...input, role: "ROOT" },
    { ...input, status: "ACTIVE" },
    { ...input, sessionVersion: 0 },
    { ...input, passwordHash: "injected" },
    { ...input, email: { $ne: "" } },
    { ...input, displayName: "<script>" },
    { ...input, password: "short1" },
    { ...input, password: "a".repeat(12) },
    { ...input, password: "س".repeat(36) + "1" },
  ]) {
    await fails(service.create(owner, invalid), 400);
  }
  const { member } = await service.create(owner, input);
  assert.equal(member.email, "editor@example.com");
  assert.equal(member.displayName, "محرر تجريبي");
  assert.equal(member.role, "CONTENT_EDITOR");
  assert.equal("passwordHash" in member, false);
  assert.equal("sessionVersion" in member, false);
  assert(
    await bcrypt.compare(input.password, records.get(member._id)!.passwordHash),
  );
  assert(!JSON.stringify(await service.list(owner)).includes("never-expose"));
  await assert.rejects(
    service.create(owner, input),
    (error) => (error as { code?: number }).code === 11000,
  );

  await fails(
    service.update(owner, { id: owner.userId, status: "SUSPENDED" }),
    403,
  );
  const secondOwner = {
    ...records.get(owner.userId)!,
    _id: "100000000000000000000002",
  };
  records.set(secondOwner._id, secondOwner);
  const fullAdminActor = { userId: secondOwner._id, role: "SUPER_ADMIN" };
  await fails(
    service.update(fullAdminActor, { id: owner.userId, status: "SUSPENDED" }),
    403,
  );
  await fails(
    service.update(fullAdminActor, {
      id: fullAdminActor.userId,
      role: "ADMIN",
    }),
    403,
  );
  await service.update(owner, { id: secondOwner._id, role: "ADMIN" });
  assert.equal(records.get(secondOwner._id)!.role, "ADMIN");
  const full = await service.create(owner, {
    ...input,
    email: "full@example.com",
    role: "SUPER_ADMIN",
  });
  assert.equal(full.member.role, "SUPER_ADMIN");
  const fullActor = { userId: full.member._id, role: full.member.role };
  assert.equal((await service.list(fullActor)).protectedOwnerId, owner.userId);
  await service.create(fullActor, { ...input, email: "from-full@example.com" });
  await service.update(owner, {
    id: fullActor.userId,
    role: "CONTENT_EDITOR",
    status: "SUSPENDED",
  });
  assert(!isCurrentAdminSession(0, records.get(fullActor.userId)!));
  for (const invalid of [
    { id: member._id, role: "ROOT" },
    { id: member._id, email: "other@example.com" },
    { id: member._id, status: "BANNED" },
    { id: member._id, password: "" },
    { id: member._id },
    { id: "invalid", status: "ACTIVE" },
    { id: member._id, sessionVersion: -1 },
  ])
    await fails(service.update(owner, invalid), 400);
  await fails(
    service.update(owner, { id: "f".repeat(24), status: "ACTIVE" }),
    404,
  );

  // Independent logins do not mutate sessionVersion. Suspension, password/role changes do.
  assert(isCurrentAdminSession(0, records.get(member._id)!));
  assert(isCurrentAdminSession(0, records.get(member._id)!));
  await service.update(owner, { id: member._id, status: "SUSPENDED" });
  assert(!isCurrentAdminSession(0, records.get(member._id)!));
  await service.update(owner, { id: member._id, status: "ACTIVE" });
  assert(!isCurrentAdminSession(0, records.get(member._id)!));
  assert(isCurrentAdminSession(2, records.get(member._id)!));
  await service.update(owner, {
    id: member._id,
    password: "Changed-test-2026",
    role: "ADMIN",
  });
  assert(!isCurrentAdminSession(2, records.get(member._id)!));
  assert(isCurrentAdminSession(3, records.get(member._id)!));
  assert(
    !(await bcrypt.compare(
      input.password,
      records.get(member._id)!.passwordHash,
    )),
  );
  assert(
    await bcrypt.compare(
      "Changed-test-2026",
      records.get(member._id)!.passwordHash,
    ),
  );
  const legacy = { ...records.get(member._id)!, role: "MODERATOR" };
  records.set(member._id, legacy);
  await service.update(owner, { id: member._id, displayName: "اسم جديد" });
  assert.equal(records.get(member._id)!.role, "MODERATOR");
  assert(!/password|\$2a\$|\$2b\$|Example-test/.test(JSON.stringify(audit)));
  assert(isCurrentAdminSession(undefined, { status: "ACTIVE" }));
  assert(
    !isCurrentAdminSession(undefined, { status: "ACTIVE", sessionVersion: 1 }),
  );
  for (const section of [
    "users",
    "entitlements",
    "dashboard",
    "settings",
    "team",
    "comments",
    "homepage",
  ])
    assert(!canAccessAdminSection("CONTENT_EDITOR", section));
  for (const section of [
    "series",
    "seasons",
    "episodes",
    "media",
    "transcripts",
    "categories",
  ])
    assert(canAccessAdminSection("CONTENT_EDITOR", section));
  assert(!canAccessAdminSection("ADMIN", "team"));
  assert(canAccessAdminSection("SUPER_ADMIN", "team"));
  for (const invalid of [
    "https://evil.test",
    "//evil.test",
    "/\\evil.test",
    "/%5cevil.test",
    "/%2fevil.test",
    "/login?returnTo=/",
    "/admin/login",
    "/%0aevil",
    "/%ZZ",
  ])
    assert.equal(safeAdminReturnTo(invalid), "/");
  assert.equal(safeAdminReturnTo("/?section=series"), "/?section=series");
  for (const origin of [
    "https://yotba-studio.vercel.app",
    "https://studio.example.com",
    "https://yotba-studio-preview.vercel.app",
    "http://localhost:3001",
  ]) {
    const url = origin + "/api/v1/admin/team";
    assert(
      isSameOriginAdminMutation(
        new Request(url, { method: "POST", headers: { Origin: origin } }),
      ),
    );
    assert(!isSameOriginAdminMutation(new Request(url, { method: "POST" })));
    for (const badOrigin of [
      "null",
      "https://evil.test",
      origin + ".evil.test",
    ])
      assert(
        !isSameOriginAdminMutation(
          new Request(url, { method: "POST", headers: { Origin: badOrigin } }),
        ),
      );
    assert(
      !isSameOriginAdminMutation(
        new Request(url, {
          headers: { Origin: origin, "Sec-Fetch-Site": "cross-site" },
        }),
      ),
    );
  }
  console.log(
    "Team service, credential handling, role permissions, session revocation and redirect safety: passed (isolated; no database/network writes).",
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
