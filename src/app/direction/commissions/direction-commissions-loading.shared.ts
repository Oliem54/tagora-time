/** Loading UI only while access or authorized books fetch is in progress. */
export function shouldShowDirectionCommissionsLoading(params: {
  accessLoading: boolean;
  canUseCommissions: boolean;
  booksLoading: boolean;
}): boolean {
  return params.accessLoading || (params.canUseCommissions && params.booksLoading);
}

/** Fetch authorized books only after access is ready and commissions is allowed. */
export function shouldLoadDirectionSalesBooks(params: {
  accessLoading: boolean;
  userPresent: boolean;
  canUseCommissions: boolean;
}): boolean {
  return !params.accessLoading && params.userPresent && params.canUseCommissions;
}
