/** The date a member's seniority counts from: the earliest one known. */
export function seniorityStart(
  joinedAt: Date,
  override: Date | undefined
): Date {
  return override && override < joinedAt ? override : joinedAt;
}
