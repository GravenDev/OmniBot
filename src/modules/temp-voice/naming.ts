export const CHANNEL_NAME_MAX = 100;
export const USER_LIMIT_MAX = 99;

export function renderName(
  template: string,
  member: { displayName: string; user: { username: string } }
): string {
  const name = template
    .replaceAll("{user}", member.displayName)
    .replaceAll("{username}", member.user.username)
    .trim();
  return (name || member.displayName).slice(0, CHANNEL_NAME_MAX);
}

export function cleanName(value: string): string | null {
  const name = value.replace(/\s+/g, " ").trim();
  return name && name.length <= CHANNEL_NAME_MAX ? name : null;
}

export function parseUserLimit(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d{1,2}$/.test(trimmed)) {
    return null;
  }
  const limit = Number(trimmed);
  return limit <= USER_LIMIT_MAX ? limit : null;
}
