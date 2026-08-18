/**
 * Canonical payable minutes for a recomputed shift.
 *
 * `workedMinutes` is the sum of active work segments only: unpaid pause and
 * unpaid lunch intervals are already excluded from that total. Do not subtract
 * unpaid buckets again (that would double-count deductions).
 *
 * Unpaid break/lunch minutes remain stored for audit/display.
 */
export function computeShiftPayableMinutes(options: {
  workedMinutes: number;
  unpaidBreakMinutes: number;
  unpaidLunchMinutes: number;
  approvedExceptionMinutes: number;
}): number {
  void options.unpaidBreakMinutes;
  void options.unpaidLunchMinutes;
  return Math.max(
    0,
    Math.floor(options.workedMinutes) + Math.floor(options.approvedExceptionMinutes)
  );
}
