"use client";

import React, {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AlertCircle,
  Check,
  Eye,
  EyeOff,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Shield,
  UserCheck,
  UserX,
  X,
} from "lucide-react";

type NoticeType = "success" | "error";
type SupportedRole = "CONTENT_EDITOR" | "ADMIN" | "SUPER_ADMIN";
type Member = {
  _id: string;
  email: string;
  displayName: string;
  role: string;
  status: string;
  lastLoginAt?: string;
  createdAt?: string;
};

type Props = { onNotice: (type: NoticeType, message: string) => void };

const roleLabel: Record<SupportedRole, string> = {
  CONTENT_EDITOR: "محرر محتوى",
  ADMIN: "مدير",
  SUPER_ADMIN: "مدير كامل الصلاحيات",
};
const roleDescription: Record<SupportedRole, string> = {
  CONTENT_EDITOR: "يرفع ويعدّل ويحذف المحتوى داخل الاستوديو.",
  ADMIN:
    "يدير المحتوى والصفحة الرئيسية والمستخدمين والإعدادات، ولا يدير فريق الاستوديو.",
  SUPER_ADMIN:
    "يدير كل المحتوى والإعدادات والمستخدمين والفريق، ويمكنه تعيين الصلاحيات.",
};

function formatDate(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString("ar-EG", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
}

export const TeamPanel: React.FC<Props> = ({ onNotice }) => {
  const [members, setMembers] = useState<Member[]>([]);
  const [currentAdminId, setCurrentAdminId] = useState<string | undefined>();
  const [protectedOwnerId, setProtectedOwnerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({
    displayName: "",
    email: "",
    password: "",
    role: "CONTENT_EDITOR",
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/v1/admin/team", {
        credentials: "include",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(data.error || "تعذر تحميل أعضاء الفريق.");
      setMembers(Array.isArray(data.members) ? data.members : []);
      setCurrentAdminId(data.currentAdminId);
      setProtectedOwnerId(data.protectedOwnerId ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر تحميل أعضاء الفريق.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);
  const resetForm = () => {
    setForm({
      displayName: "",
      email: "",
      password: "",
      role: "CONTENT_EDITOR",
    });
    setEditingId(null);
    setShowPassword(false);
  };
  const isEditing = Boolean(editingId);
  const editingMember = useMemo(
    () => members.find((member) => member._id === editingId),
    [members, editingId],
  );
  const nameInputRef = useRef<HTMLInputElement>(null);

  const startEdit = (member: Member) => {
    if (member._id === protectedOwnerId || member._id === currentAdminId)
      return;
    setEditingId(member._id);
    setForm({
      displayName: member.displayName,
      email: member.email,
      password: "",
      role: member.role,
    });
    setShowPassword(false);
    window.setTimeout(() => {
      nameInputRef.current?.focus();
      nameInputRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 0);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.displayName.trim() || (!isEditing && !form.email.trim())) {
      onNotice("error", "أدخل الاسم والبريد الإلكتروني.");
      return;
    }
    if (
      (!isEditing || form.password) &&
      (form.password.length < 12 ||
        !/\p{L}/u.test(form.password) ||
        !/\p{N}/u.test(form.password))
    ) {
      onNotice(
        "error",
        "كلمة المرور يجب أن تكون 12 حرفًا على الأقل وتحتوي على حروف وأرقام.",
      );
      return;
    }
    const promoting =
      form.role === "SUPER_ADMIN" && editingMember?.role !== "SUPER_ADMIN";
    if ((form.role === "SUPER_ADMIN" && !isEditing) || promoting) {
      if (
        !window.confirm(
          "هذه الصلاحية تمنح وصولًا كاملًا لإدارة الفريق والصلاحيات. هل أنت متأكد؟",
        )
      )
        return;
    }
    if (form.password && new TextEncoder().encode(form.password).length > 72) {
      onNotice("error", "كلمة المرور يجب ألا تتجاوز 72 بايتًا بصيغة UTF-8.");
      return;
    }
    setSaving(true);
    try {
      const body: Record<string, string> = isEditing
        ? { id: editingId!, displayName: form.displayName.trim() }
        : {
            email: form.email.trim(),
            displayName: form.displayName.trim(),
            password: form.password,
            role: form.role,
          };
      if (
        isEditing &&
        form.role !== editingMember?.role &&
        (form.role === "ADMIN" ||
          form.role === "CONTENT_EDITOR" ||
          form.role === "SUPER_ADMIN")
      )
        body.role = form.role;
      if (form.password) body.password = form.password;
      const response = await fetch("/api/v1/admin/team", {
        method: isEditing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "تعذر حفظ التغييرات.");
      onNotice(
        "success",
        isEditing ? "تم تحديث بيانات عضو الفريق." : "تم إنشاء عضو الفريق.",
      );
      resetForm();
      await load();
    } catch (err) {
      onNotice(
        "error",
        err instanceof Error ? err.message : "تعذر حفظ التغييرات.",
      );
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (member: Member) => {
    if (member._id === protectedOwnerId || member._id === currentAdminId)
      return;
    const nextStatus = member.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
    const action = nextStatus === "ACTIVE" ? "إعادة تفعيل" : "تعليق";
    if (
      !window.confirm(`هل أنت متأكد من ${action} حساب ${member.displayName}؟`)
    )
      return;
    setSaving(true);
    try {
      const response = await fetch("/api/v1/admin/team", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id: member._id, status: nextStatus }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "تعذر تغيير حالة العضو.");
      onNotice("success", `تم ${action} الحساب.`);
      if (editingId === member._id) resetForm();
      await load();
    } catch (err) {
      onNotice(
        "error",
        err instanceof Error ? err.message : "تعذر تغيير حالة العضو.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="space-y-6" dir="rtl">
      <div className="rounded-xl border border-border-subtle bg-surface p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-editorial-ivory">
              {isEditing
                ? `تعديل ${editingMember?.displayName || "عضو الفريق"}`
                : "إضافة عضو إلى الفريق"}
            </h2>
            <p className="mt-1 text-xs leading-6 text-editorial-secondary">
              شارك رابط دخول Studio والبريد مع العضو، وأرسل كلمة المرور له عبر
              قناة آمنة منفصلة. لا يتم إرسال دعوة تلقائية.
            </p>
            <a
              className="mt-1 inline-block text-xs text-crimson-bright underline"
              href="/login"
              target="_blank"
              rel="noopener noreferrer"
            >
              فتح رابط دخول Studio
            </a>
          </div>
          <Plus className="mt-1 h-5 w-5 text-crimson" aria-hidden="true" />
        </div>
        <form
          onSubmit={submit}
          className="grid grid-cols-1 gap-3 md:grid-cols-2"
        >
          <fieldset disabled={saving} className="contents">
            <div>
              <label
                htmlFor="team-name"
                className="mb-1 block text-xs font-semibold text-editorial-ivory"
              >
                الاسم
              </label>
              <input
                ref={nameInputRef}
                id="team-name"
                maxLength={80}
                value={form.displayName}
                onChange={(e) =>
                  setForm({ ...form, displayName: e.target.value })
                }
                className="min-h-11 w-full rounded-lg border border-border-subtle bg-obsidian-850 px-3 text-sm text-editorial-ivory focus:border-crimson focus:outline-none focus-visible:ring-2 focus-visible:ring-crimson"
                required
              />
            </div>
            <div>
              <label
                htmlFor="team-email"
                className="mb-1 block text-xs font-semibold text-editorial-ivory"
              >
                البريد الإلكتروني
              </label>
              <input
                id="team-email"
                type="email"
                dir="ltr"
                autoComplete="off"
                autoCapitalize="none"
                value={form.email}
                disabled={isEditing}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="min-h-11 w-full rounded-lg border border-border-subtle bg-obsidian-850 px-3 text-sm text-editorial-ivory disabled:opacity-60 focus:border-crimson focus:outline-none focus-visible:ring-2 focus-visible:ring-crimson"
                required={!isEditing}
              />
            </div>
            <div>
              <label
                htmlFor="team-password"
                className="mb-1 block text-xs font-semibold text-editorial-ivory"
              >
                {isEditing ? "كلمة مرور جديدة (اختياري)" : "كلمة المرور"}
              </label>
              <div className="relative">
                <input
                  id="team-password"
                  dir="ltr"
                  autoComplete="new-password"
                  minLength={12}
                  type={showPassword ? "text" : "password"}
                  value={form.password}
                  onChange={(e) =>
                    setForm({ ...form, password: e.target.value })
                  }
                  placeholder={
                    isEditing
                      ? "اتركها فارغة للإبقاء عليها"
                      : "12 حرفًا على الأقل"
                  }
                  className="min-h-11 w-full rounded-lg border border-border-subtle bg-obsidian-850 px-3 pr-11 pl-3 text-sm text-editorial-ivory placeholder:text-editorial-secondary/60 focus:border-crimson focus:outline-none focus-visible:ring-2 focus-visible:ring-crimson"
                  required={!isEditing}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-0 top-0 flex min-h-11 min-w-11 items-center justify-center rounded text-editorial-secondary hover:text-editorial-ivory focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson"
                  aria-pressed={showPassword}
                  aria-label={
                    showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"
                  }
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              <p className="mt-1 text-[11px] text-editorial-secondary">
                12+ حرفًا، ويجب أن تحتوي على حروف وأرقام (حتى 72 بايت UTF-8).
              </p>
            </div>
            <div className="md:col-span-2">
              <span className="mb-1 block text-xs font-semibold text-editorial-ivory">
                الصلاحية
              </span>
              <div className="grid min-h-11 grid-cols-1 gap-2 sm:grid-cols-3">
                {(
                  ["CONTENT_EDITOR", "ADMIN", "SUPER_ADMIN"] as SupportedRole[]
                ).map((role) => (
                  <button
                    key={role}
                    type="button"
                    aria-pressed={form.role === role}
                    onClick={() => setForm({ ...form, role })}
                    className={`min-h-11 rounded-lg border px-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson ${form.role === role ? "border-crimson bg-crimson-subtle text-crimson-bright" : "border-border-subtle bg-obsidian-850 text-editorial-secondary hover:text-editorial-ivory"}`}
                  >
                    {roleLabel[role]}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-[11px] text-editorial-secondary">
                {roleDescription[form.role as SupportedRole] ||
                  `الصلاحية الحالية: ${form.role}`}
              </p>
            </div>
            <div className="flex items-end justify-end gap-2 md:col-span-2">
              <button
                type="submit"
                className="flex min-h-11 min-w-32 items-center justify-center gap-2 rounded-lg bg-crimson px-4 text-sm font-bold text-white hover:bg-crimson-bright focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson disabled:opacity-50"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                {isEditing ? "حفظ" : "إضافة"}
              </button>
              {isEditing && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-border-subtle text-editorial-secondary hover:text-editorial-ivory focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson"
                  aria-label="إلغاء التعديل"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </fieldset>
        </form>
      </div>
      {error && (
        <div className="flex items-center gap-3 rounded-xl border border-crimson/30 bg-crimson-subtle p-4 text-sm text-crimson-bright">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span>{error}</span>
          <button
            disabled={saving}
            onClick={() => void load()}
            className="mr-auto min-h-11 px-3 text-xs font-bold underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson"
          >
            إعادة المحاولة
          </button>
        </div>
      )}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-editorial-ivory">
          أعضاء الفريق{" "}
          <span className="text-xs font-normal text-editorial-secondary">
            ({members.length})
          </span>
        </h2>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading || saving}
          className="flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-border-subtle text-editorial-secondary hover:text-editorial-ivory focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson"
          aria-label="تحديث قائمة الفريق"
        >
          <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
        </button>
      </div>
      {loading ? (
        <div className="flex min-h-48 items-center justify-center rounded-xl border border-border-subtle bg-surface text-editorial-secondary">
          <Loader2 className="h-7 w-7 animate-spin text-crimson" />
        </div>
      ) : members.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border-subtle bg-surface p-8 text-center text-sm text-editorial-secondary">
          لا يوجد أعضاء إضافيون في الفريق بعد.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {members.map((member) => {
            const owner = member._id === protectedOwnerId;
            const self = member._id === currentAdminId;
            const active = member.status === "ACTIVE";
            const readOnly = owner || self;
            return (
              <article
                key={member._id}
                className="rounded-xl border border-border-subtle bg-surface p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate font-bold text-editorial-ivory">
                      {member.displayName}
                    </h3>
                    <p
                      className="mt-1 truncate text-xs text-editorial-secondary"
                      dir="ltr"
                    >
                      {member.email}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${active ? "border-emerald-800/50 bg-emerald-950/30 text-emerald-300" : "border-amber-800/50 bg-amber-950/30 text-amber-300"}`}
                  >
                    {active ? "نشط" : "معلق"}
                  </span>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
                  <span className="inline-flex items-center gap-1 rounded-md border border-border-subtle px-2 py-1 text-editorial-secondary">
                    {member.role === "SUPER_ADMIN" ? (
                      <Shield className="h-3.5 w-3.5" />
                    ) : (
                      <UserCheck className="h-3.5 w-3.5" />
                    )}
                    {roleLabel[member.role as SupportedRole] || member.role}
                  </span>
                  <span className="text-editorial-secondary">
                    آخر دخول: {formatDate(member.lastLoginAt)}
                  </span>
                </div>
                {readOnly ? (
                  <p className="mt-3 text-xs text-editorial-secondary">
                    {owner
                      ? "المالك الأصلي محمي ولا يمكن تعديله أو تعليق حالته."
                      : "حسابك الحالي للقراءة فقط حفاظًا على إمكانية الدخول."}
                  </p>
                ) : (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => startEdit(member)}
                      className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-border-subtle px-3 text-xs font-semibold text-editorial-secondary hover:border-crimson hover:text-editorial-ivory focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      تعديل
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void changeStatus(member)}
                      className={`inline-flex min-h-11 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson ${active ? "border-amber-800/50 text-amber-300 hover:bg-amber-950/30" : "border-emerald-800/50 text-emerald-300 hover:bg-emerald-950/30"}`}
                    >
                      {active ? (
                        <UserX className="h-3.5 w-3.5" />
                      ) : (
                        <UserCheck className="h-3.5 w-3.5" />
                      )}
                      {active ? "تعليق" : "إعادة تفعيل"}
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
};

export default TeamPanel;
