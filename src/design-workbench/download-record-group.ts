import { encodeImage, type DownloadFormat } from './download-image';

type ResultImage = { url: string };

const encoder = new TextEncoder();
const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
function crc32(bytes: Uint8Array) {
  let value = 0xffffffff;
  for (const byte of bytes) value = crcTable[(value ^ byte) & 255] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}
function safeName(name: string) { return name.replace(/[\\/:*?"<>|]/g, '-').trim() || '任务结果'; }

// Re-encode each result in the selected format before adding it to one ZIP.
export async function downloadRecordGroup(images: ResultImage[], title: string, format: DownloadFormat) {
  if (!images.length) return;
  const chunks: Uint8Array[] = [], directory: Uint8Array[] = [];
  let offset = 0;
  for (let index = 0; index < images.length; index++) {
    const response = await fetch(images[index].url);
    if (!response.ok) throw new Error('下载失败，请重试。');
    const source = URL.createObjectURL(await response.blob());
    let bytes: Uint8Array;
    try {
      const image = new Image();
      image.src = source;
      await image.decode();
      bytes = new Uint8Array(await (await encodeImage(image, format)).arrayBuffer());
    } finally { URL.revokeObjectURL(source); }
    const name = encoder.encode(`${safeName(title)}-${index + 1}.${format.toLowerCase()}`);
    const checksum = crc32(bytes);
    const local = new Uint8Array(30 + name.length), localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true); localView.setUint16(4, 20, true); localView.setUint16(6, 0x0800, true);
    localView.setUint32(14, checksum, true); localView.setUint32(18, bytes.length, true); localView.setUint32(22, bytes.length, true);
    localView.setUint16(26, name.length, true); local.set(name, 30);
    const central = new Uint8Array(46 + name.length), centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true); centralView.setUint16(4, 20, true); centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0x0800, true); centralView.setUint32(16, checksum, true);
    centralView.setUint32(20, bytes.length, true); centralView.setUint32(24, bytes.length, true);
    centralView.setUint16(28, name.length, true); centralView.setUint32(42, offset, true); central.set(name, 46);
    chunks.push(local, bytes); directory.push(central); offset += local.length + bytes.length;
  }
  const directorySize = directory.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22), endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true); endView.setUint16(8, images.length, true); endView.setUint16(10, images.length, true);
  endView.setUint32(12, directorySize, true); endView.setUint32(16, offset, true);
  const blob = new Blob([...chunks, ...directory, end] as BlobPart[], { type: 'application/zip' });
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = `${safeName(title)}-结果图.zip`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
