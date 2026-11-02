/**
 * A promise nobody waited for that failed is logged and the process goes on. Node ends the process
 * on such a rejection: in the worker that took every running ffmpeg with it and the stalled jobs
 * ran again after the restart.
 */
export function logUnhandledRejections(
  log: (message: string, reason: unknown) => void,
): void {
  process.on('unhandledRejection', (reason) =>
    log('Unhandled promise rejection', reason),
  );
}
