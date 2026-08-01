// Detects image content type/extension from magic bytes rather than
// trusting a provider's response headers or an upload's filename/multipart
// MIME type (planning.md story 11 and, later, stories 12/25). Only the 3
// formats the app accepts anywhere (JPEG, PNG, WebP) are recognized; any
// other content returns `null` so the caller can fail the request.
export interface DetectedImageFormat {
  contentType: 'image/jpeg' | 'image/png' | 'image/webp';
  fileExtension: 'jpg' | 'png' | 'webp';
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_SIGNATURE = Buffer.from([0xff, 0xd8, 0xff]);

export function detectImageFormat(bytes: Buffer): DetectedImageFormat | null {
  if (bytes.length >= JPEG_SIGNATURE.length && bytes.subarray(0, 3).equals(JPEG_SIGNATURE)) {
    return { contentType: 'image/jpeg', fileExtension: 'jpg' };
  }

  if (bytes.length >= PNG_SIGNATURE.length && bytes.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return { contentType: 'image/png', fileExtension: 'png' };
  }

  // WebP files are a RIFF container: bytes 0-3 are "RIFF", bytes 8-11 are
  // "WEBP".
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
    bytes.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return { contentType: 'image/webp', fileExtension: 'webp' };
  }

  return null;
}
