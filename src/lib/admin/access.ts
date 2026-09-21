export function canAccessAdminSection(role: string, section: string): boolean {
  if (role === "SUPER_ADMIN") return true;
  if (role === "ADMIN") return section !== "team";
  if (role === "CONTENT_EDITOR")
    return [
      "series",
      "seasons",
      "episodes",
      "transcripts",
      "media",
      "categories",
    ].includes(section);
  if (role === "MODERATOR") return section === "comments";
  if (role === "ANALYTICS_VIEWER") return section === "dashboard";
  return false;
}

export function isCurrentAdminSession(
  tokenVersion: number | undefined,
  admin: { status: string; sessionVersion?: number },
): boolean {
  return (
    admin.status === "ACTIVE" &&
    (tokenVersion ?? 0) === (admin.sessionVersion ?? 0)
  );
}

export function isSameOriginAdminMutation(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (
    !origin ||
    origin === "null" ||
    request.headers.get("sec-fetch-site") === "cross-site"
  )
    return false;
  try {
    return origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

export function safeAdminReturnTo(value: unknown): string {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    /[\\\u0000-\u0020\u007f]/.test(value)
  )
    return "/";
  try {
    const decoded = decodeURIComponent(value);
    if (decoded.startsWith("//") || /[\\\u0000-\u0020\u007f]/.test(decoded))
      return "/";
    if (/^\/(?:admin\/)?login(?:[/?#]|$)/i.test(decoded)) return "/";
    return value;
  } catch {
    return "/";
  }
}
