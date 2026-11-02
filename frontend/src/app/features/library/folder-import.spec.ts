import { groupOf, readEntries } from './folder-import';

/** A fake file-system entry tree like the one a dropped folder gives. */
function dir(fullPath: string, children: FileSystemEntry[]): FileSystemEntry {
  let read = false;
  return {
    isFile: false,
    isDirectory: true,
    fullPath,
    name: fullPath.split('/').pop()!,
    createReader: () => ({
      // Two batches, then none, as a browser does for a big folder.
      readEntries: (ok: (e: FileSystemEntry[]) => void) => {
        if (read) return ok([]);
        read = true;
        ok(children);
      },
    }),
  } as unknown as FileSystemEntry;
}

function file(fullPath: string): FileSystemEntry {
  const name = fullPath.split('/').pop()!;
  return {
    isFile: true,
    isDirectory: false,
    fullPath,
    name,
    file: (ok: (f: File) => void) => ok(new File(['x'], name, { type: 'video/mp4' })),
  } as unknown as FileSystemEntry;
}

describe('folder import', () => {
  it('a subfolder, however deep, is one stack named after it; the folder’s own files stay single', () => {
    expect(groupOf('Trip/a.mp4')).toBeNull();
    expect(groupOf('a.mp4')).toBeNull();
    expect(groupOf('Trip/Day 1/a.mp4')).toEqual({ key: 'Trip/Day 1', name: 'Day 1' });
    expect(groupOf('Trip/Day 1/Morning/b.mp4')).toEqual({ key: 'Trip/Day 1', name: 'Day 1' });
  });

  it('walks a dropped folder and keeps each file’s path', async () => {
    const tree = dir('/Trip', [
      file('/Trip/a.mp4'),
      dir('/Trip/Day 1', [
        file('/Trip/Day 1/b.mp4'),
        dir('/Trip/Day 1/Late', [file('/Trip/Day 1/Late/c.mp4')]),
      ]),
    ]);
    const picked = await readEntries([tree, file('/loose.mp4')]);
    expect(picked.map((p) => [p.path, p.file.name])).toEqual([
      ['Trip/a.mp4', 'a.mp4'],
      ['Trip/Day 1/b.mp4', 'b.mp4'],
      ['Trip/Day 1/Late/c.mp4', 'c.mp4'],
      ['loose.mp4', 'loose.mp4'],
    ]);
  });
});
