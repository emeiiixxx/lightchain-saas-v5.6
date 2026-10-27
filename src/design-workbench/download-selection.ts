import { encodeImage, type DownloadFormat } from './download-image';
import type { CanvasImage } from './useCanvas';

const encoder = new TextEncoder();
function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// Encode every selected image in the chosen format, then download one ZIP.
export async function downloadSelection(items: CanvasImage[], format: DownloadFormat) {
  const files = await Promise.all(items.map(async (item, index) => {
    const blob = await encodeImage(item.image, format);
    const extension = format.toLowerCase();
    const name = encoder.encode(`${index + 1}-${item.name.replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]/g, '_')}.${extension}`);
    const data = new Uint8Array(await blob.arrayBuffer());
    return { name, data, crc: crc32(data) };
  }));
  const local: Uint8Array[] = [], central: Uint8Array[] = [];
  let offset = 0, centralSize = 0;
  for (const { name, data, crc } of files) {
    const header = new Uint8Array(30 + name.length), h = new DataView(header.buffer);
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x800, true); h.setUint16(12, 33, true);
    h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, name.length, true); header.set(name, 30);
    const entry = new Uint8Array(46 + name.length), c = new DataView(entry.buffer);
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x800, true); c.setUint16(14, 33, true);
    c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, name.length, true); c.setUint32(42, offset, true); entry.set(name, 46);
    local.push(header, data); central.push(entry); offset += header.length + data.length; centralSize += entry.length;
  }
  const end = new Uint8Array(22), e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, centralSize, true); e.setUint32(16, offset, true);
  const zip = new Uint8Array(offset + centralSize + end.length);
  let position = 0;
  for (const part of [...local, ...central, end]) { zip.set(part, position); position += part.length; }
  const url = URL.createObjectURL(new Blob([zip.buffer], { type: 'application/zip' }));
  const link = document.createElement('a'); link.href = url; link.download = 'Lightchain-images.zip'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
