import { type UploadGroup } from '../../core/upload/upload.store';

/** A file of an imported folder and its path from that folder ("Trip/Day 1/a.mp4"). */
export interface PickedFile {
  file: File;
  path: string;
}

/**
 * Which stack a file of an imported folder goes into: the files right in the
 * folder stay single videos; everything under a subfolder, however deep, becomes one stack named
 * after that subfolder (stacks do not nest).
 */
export function groupOf(path: string): UploadGroup | null {
  const parts = path.split('/').filter(Boolean);
  if (parts.length < 3) return null;
  return { key: `${parts[0]}/${parts[1]}`, name: parts[1]! };
}

/** Files from `<input webkitdirectory>`: each knows its path from the picked folder. */
export function pickedFromInput(files: readonly File[]): PickedFile[] {
  return files.map((file) => ({ file, path: file.webkitRelativePath || file.name }));
}

/**
 * The dropped items as entries. Must run inside the drop event: the browser empties the list as
 * soon as the handler returns.
 */
export function droppedEntries(data: DataTransfer | null): FileSystemEntry[] {
  return Array.from(data?.items ?? [])
    .filter((i) => i.kind === 'file')
    .map((i) => i.webkitGetAsEntry?.() ?? null)
    .filter((e): e is FileSystemEntry => e !== null);
}

/** Every file under the dropped entries, folders walked through. */
export async function readEntries(entries: readonly FileSystemEntry[]): Promise<PickedFile[]> {
  const out: PickedFile[] = [];
  for (const entry of entries) await walk(entry, out);
  return out;
}

async function walk(entry: FileSystemEntry, out: PickedFile[]): Promise<void> {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) =>
      (entry as FileSystemFileEntry).file(resolve, reject),
    );
    out.push({ file, path: entry.fullPath.replace(/^\//, '') || file.name });
    return;
  }
  if (!entry.isDirectory) return;
  const reader = (entry as FileSystemDirectoryEntry).createReader();
  // readEntries hands out a batch at a time (about a hundred in Chrome) until it gives none.
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) =>
      reader.readEntries(resolve, reject),
    );
    if (batch.length === 0) return;
    for (const child of batch) await walk(child, out);
  }
}
