// Sharing a sheet (PLAN.md: the Web Share API with files where supported, falling
// back to a download). Neither leaves the game: the device's own share sheet or
// download does the rest.

/** A file name like vivi-fashion-2026-10-25-0932.png. */
export function sheetFileName(when = new Date()): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `vivi-fashion-${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}-${pad(when.getHours())}${pad(when.getMinutes())}.png`;
}

/** Offer the device's share sheet with the image, or download it. Resolves to how it went. */
export async function shareImage(png: Blob, name: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const file = new File([png], name, { type: 'image/png' });
  if (typeof navigator.share === 'function' && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Vivi Fashion Dresses' });
      return 'shared';
    } catch (e) {
      if ((e as DOMException).name === 'AbortError') return 'cancelled';
      // Some browsers refuse files after all; download instead.
    }
  }
  const url = URL.createObjectURL(png);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.hidden = true;
  document.body.append(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  return 'downloaded';
}
