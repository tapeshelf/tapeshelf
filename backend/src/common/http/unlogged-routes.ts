/** Requests the HTTP log leaves out: the health check, polled all the time. */

export function isUnloggedRoute(url: string | undefined): boolean {
  if (!url) return false;
  return url === '/api/health';
}
