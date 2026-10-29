export const ACCESS_MODES = ["open", "invite", "private"] as const;

export type AccessMode = (typeof ACCESS_MODES)[number];

export function isAccessMode(value: string | undefined): value is AccessMode {
  return (ACCESS_MODES as readonly string[]).includes(value ?? "");
}

export function accessMode({
  locked,
  hidden,
}: {
  locked: boolean;
  hidden: boolean;
}): AccessMode {
  if (hidden) {
    return "private";
  }
  return locked ? "invite" : "open";
}

export function modeFlags(mode: AccessMode): {
  locked: boolean;
  hidden: boolean;
} {
  return { locked: mode !== "open", hidden: mode === "private" };
}
