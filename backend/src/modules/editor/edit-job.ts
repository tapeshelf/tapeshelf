import { extname } from 'node:path';

import type { EditSpec } from './edit-spec.js';

/**
 * Saving in the editor: into the same video — its link and holders see the
 * new version, which takes the place of the old one for good, the original included — or as a new
 * video, leaving this one as it is.
 */
export type EditMode = 'replace' | 'copy';
export type EditJobStatus = 'queued' | 'rendering' | 'failed';
export type EditError = 'render' | 'internal';

/** `Video.editJob`: the one edit of a video waiting for, or going through, its render. */
export interface EditJob {
  revision: number;
  mode: EditMode;
  /** Null only in the jobs of the old "back to the original", let go at once. */
  spec: EditSpec | null;
  requestedById: string;
  requestedAt: string;
  status: EditJobStatus;
  /** 0–100. */
  progress: number;
  error: EditError | null;
  /** The new video's title (copy). */
  copyTitle?: string;
  /** The copy's video, on the author's shelf from the save on. */
  copyId?: string;
}

/**
 * An edit waiting for or going through its render (a failed one is not). Meanwhile the video —
 * for a copy, the copy — is "being edited" (`stage` EDIT): no one watches it until it is done.
 */
export function editInProgress(job: unknown): job is EditJob {
  const j = job as EditJob | null;
  return !!j && j.status !== 'failed';
}

/** What a video under an edit is, and what it is again when the edit ends or goes. */
export const UNDER_EDIT = {
  status: 'PROCESSING',
  stage: 'EDIT',
  progress: 0,
} as const;
export const READY_AGAIN = {
  status: 'READY',
  stage: null,
  progress: 100,
} as const;

/**
 * `Video.sourceInfo`: the original as it was before its first edit, while edits kept it. Since
 * Nothing writes it; videos edited before are baked (`MaintenanceService.bakeEdits`).
 */
export interface SourceInfo {
  durationSec: number;
  width: number;
  height: number;
  hasAudio: boolean;
  hlsPrefix: string;
  segmentCount: number | null;
  probe: unknown;
}

/** A replaced version's files go after this: a player that began on it keeps its segments. */
export const OLD_FILES_GRACE_MS = 3 * 3600_000;

/** The file's name as the edited MP4 it now is: "lake.mov" → "lake.mp4". */
export function asMp4(filename: string): string {
  const ext = extname(filename);
  return `${ext ? filename.slice(0, -ext.length) : filename}.mp4`;
}
