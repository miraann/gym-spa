import { platform } from './runtime';

// Saving a file the app made, such as the import's rows left out (step 2j). The web app and the
// Windows app download it: the browser saves it, and the Windows app asks where with Windows' save
// dialog (apps/desktop/src/main.ts). Android's WebView can't download what a page makes (a blob:
// address), so the app writes the file to its cache and opens the share sheet, where staff save it
// to Drive or Files or send it on. iOS later works the same; its share sheet has "Save to Files".

export interface FileToSave {
  /** The file's name, with its extension. */
  readonly name: string;
  readonly content: Blob;
}

/** downloaded: the browser or the Windows app took it; shared: the share sheet did; cancelled: closed. */
export type SaveResult = 'downloaded' | 'shared' | 'cancelled';

function download(file: FileToSave): SaveResult {
  const url = URL.createObjectURL(file.content);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  link.click();
  // Some browsers start the download only after the click returns.
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 10_000);
  return 'downloaded';
}

/** The file's bytes as base64, which the Filesystem plugin takes for binary content. */
export async function base64Of(content: Blob): Promise<string> {
  const bytes = new Uint8Array(await content.arrayBuffer());
  let binary = '';
  // In slices: one call with every byte as an argument overflows the stack on large files.
  for (let start = 0; start < bytes.length; start += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(start, start + 0x8000));
  }
  return btoa(binary);
}

async function share(file: FileToSave): Promise<SaveResult> {
  const [{ Directory, Filesystem }, { Share }] = await Promise.all([
    import('@capacitor/filesystem'),
    import('@capacitor/share'),
  ]);
  const { uri } = await Filesystem.writeFile({
    path: `saved/${file.name}`,
    data: await base64Of(file.content),
    directory: Directory.Cache,
    recursive: true,
  });
  try {
    await Share.share({ files: [uri], dialogTitle: file.name });
    return 'shared';
  } catch (error) {
    // Closing the share sheet without picking anything rejects ("Share canceled").
    if (error instanceof Error && /cancel/i.test(error.message)) return 'cancelled';
    throw error;
  }
}

/** Saves a file the app made, the way the platform allows (see above). */
export function saveFile(file: FileToSave): Promise<SaveResult> {
  return platform === 'android' || platform === 'ios'
    ? share(file)
    : Promise.resolve(download(file));
}
