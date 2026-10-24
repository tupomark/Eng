import { Inflate } from "fflate";
import { MATERIAL_LIMITS } from "@/domain/materials/types";
import { assertNotCancelled } from "@/domain/imports/lexical-import";

const decoder = new TextDecoder("utf-8", { fatal: true });
const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++)
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const value of bytes) crc = crcTable[(crc ^ value) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export function archivePath(path: string, base = ""): string {
  if (
    !path ||
    path.includes("\\") ||
    path.includes("\0") ||
    /^(?:\/|[a-z][a-z\d+.-]*:)/iu.test(path)
  )
    throw new Error("The archive contains an unsafe file path.");
  const result = base ? base.split("/").slice(0, -1) : [];
  for (const part of path.split("/")) {
    if (part === "..") {
      if (!result.length)
        throw new Error("A file points outside this archive.");
      result.pop();
    } else if (part && part !== ".") result.push(part);
  }
  return result.join("/");
}

/** ZIP central-directory bounds are checked before any inflation. No file is executed. */
export async function readBoundedZip(
  bytes: Uint8Array,
  signal?: AbortSignal,
): Promise<Map<string, Uint8Array>> {
  if (bytes.length > MATERIAL_LIMITS.maxFileBytes || bytes.length < 22)
    throw new Error("This archive is too large or incomplete.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (
    let offset = bytes.length - 22;
    offset >= Math.max(0, bytes.length - 65_557);
    offset--
  ) {
    if (
      view.getUint32(offset, true) === 0x06054b50 &&
      offset + 22 + view.getUint16(offset + 20, true) === bytes.length
    ) {
      end = offset;
      break;
    }
  }
  if (end < 0) throw new Error("This is not a complete supported ZIP archive.");
  const count = view.getUint16(end + 10, true);
  const directoryBytes = view.getUint32(end + 12, true);
  const directory = view.getUint32(end + 16, true);
  if (
    view.getUint16(end + 4, true) ||
    view.getUint16(end + 6, true) ||
    view.getUint16(end + 8, true) !== count ||
    count === 65535 ||
    !count ||
    count > MATERIAL_LIMITS.maxArchiveEntries ||
    directory + directoryBytes !== end
  )
    throw new Error(
      "This archive uses an unsupported layout or has too many files.",
    );
  const entries: {
    name: string;
    size: number;
    compressed: number;
    method: number;
    crc: number;
    start: number;
    header: number;
  }[] = [];
  const names = new Set<string>();
  let offset = directory;
  let expandedTotal = 0;
  for (let index = 0; index < count; index++) {
    if (offset + 46 > end || view.getUint32(offset, true) !== 0x02014b50)
      throw new Error("The archive directory is damaged.");
    const flags = view.getUint16(offset + 8, true);
    const method = view.getUint16(offset + 10, true);
    const compressed = view.getUint32(offset + 20, true);
    const size = view.getUint32(offset + 24, true);
    const nameBytes = view.getUint16(offset + 28, true);
    const extraBytes = view.getUint16(offset + 30, true);
    const commentBytes = view.getUint16(offset + 32, true);
    const header = view.getUint32(offset + 42, true);
    if (
      offset + 46 + nameBytes + extraBytes + commentBytes > end ||
      !nameBytes ||
      nameBytes > 512
    )
      throw new Error("A file entry is damaged.");
    const rawName = decoder.decode(
      bytes.subarray(offset + 46, offset + 46 + nameBytes),
    );
    const name = archivePath(rawName);
    if (rawName.split("/").includes("..") || names.has(name))
      throw new Error("The archive contains duplicate or unsafe paths.");
    names.add(name);
    if (flags & 1 || ![0, 8].includes(method))
      throw new Error("Encrypted or unsupported compression is not accepted.");
    if (
      size > MATERIAL_LIMITS.maxEntryBytes ||
      (expandedTotal += size) > MATERIAL_LIMITS.maxExpandedBytes ||
      size > Math.max(100_000, compressed * 200)
    )
      throw new Error("The archive exceeds safe decompression limits.");
    if (
      header + 30 > directory ||
      view.getUint32(header, true) !== 0x04034b50 ||
      view.getUint16(header + 8, true) !== method
    )
      throw new Error("A file header is damaged.");
    const localNameBytes = view.getUint16(header + 26, true);
    const localExtra = view.getUint16(header + 28, true);
    const start = header + 30 + localNameBytes + localExtra;
    if (
      start + compressed > directory ||
      decoder.decode(
        bytes.subarray(header + 30, header + 30 + localNameBytes),
      ) !== rawName
    )
      throw new Error("A file entry points outside its data.");
    if (!rawName.endsWith("/"))
      entries.push({
        name,
        size,
        compressed,
        method,
        crc: view.getUint32(offset + 16, true),
        start,
        header,
      });
    offset += 46 + nameBytes + extraBytes + commentBytes;
  }
  if (offset !== end)
    throw new Error("The archive directory has unexpected data.");
  const ranges = entries.slice().sort((a, b) => a.header - b.header);
  for (let index = 1; index < ranges.length; index++)
    if (
      ranges[index].header <
      ranges[index - 1].start + ranges[index - 1].compressed
    )
      throw new Error("Archive file entries overlap.");
  const files = new Map<string, Uint8Array>();
  let actualTotal = 0;
  for (const entry of entries) {
    assertNotCancelled(signal);
    const chunks: Uint8Array[] = [];
    let length = 0;
    const append = (chunk: Uint8Array) => {
      length += chunk.length;
      actualTotal += chunk.length;
      if (
        length > entry.size ||
        length > MATERIAL_LIMITS.maxEntryBytes ||
        actualTotal > MATERIAL_LIMITS.maxExpandedBytes
      )
        throw new Error(
          "The archive exceeded its declared decompression limits.",
        );
      chunks.push(chunk);
    };
    if (entry.method === 0)
      append(bytes.subarray(entry.start, entry.start + entry.compressed));
    else {
      const inflate = new Inflate(append);
      for (let cursor = 0; cursor < entry.compressed; cursor += 16_384) {
        assertNotCancelled(signal);
        const final = cursor + 16_384 >= entry.compressed;
        inflate.push(
          bytes.subarray(
            entry.start + cursor,
            entry.start + Math.min(entry.compressed, cursor + 16_384),
          ),
          final,
        );
        if (!final)
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
    }
    if (length !== entry.size)
      throw new Error("A file could not be fully decompressed.");
    const output = new Uint8Array(length);
    let cursor = 0;
    for (const chunk of chunks) {
      output.set(chunk, cursor);
      cursor += chunk.length;
    }
    if (crc32(output) !== entry.crc)
      throw new Error("An archive file failed its integrity check.");
    files.set(entry.name, output);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  return files;
}
