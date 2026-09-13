// zip.js – Minimaler ZIP-Reader/-Writer in reinem JS, ohne externe Bibliothek
// (passend zum Rest des Frontends: kein Framework/Bundler, keine externen Ressourcen).
// Schreiben: nur Methode 0 "store" (unkomprimiert) – einfach, korrekt, für bereits
// komprimierte Bilddateien (JPEG/PNG/…) ohnehin ohne Vorteil durch Deflate.
// Lesen: unterstützt zusätzlich Methode 8 "deflate" über die native
// DecompressionStream-API, damit auch ZIPs robust gelesen werden, die zwischendurch
// in einem externen Tool (7-Zip, macOS Archive Utility, …) neu gepackt wurden.

let crcTable = null;
function getCrcTable() {
  if (crcTable) return crcTable;
  crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    crcTable[n] = c >>> 0;
  }
  return crcTable;
}

function crc32(bytes) {
  const table = getCrcTable();
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = table[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Aktuelles Datum als MS-DOS Datum/Zeit (ZIP-Format). */
function dosDateTime(date) {
  const time = ((date.getHours() & 0x1f) << 11) | ((date.getMinutes() & 0x3f) << 5) | ((date.getSeconds() >> 1) & 0x1f);
  const day = (((date.getFullYear() - 1980) & 0x7f) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, day };
}

/**
 * ZIP-Datei aus Dateien bauen (nur "store", unkomprimiert).
 * @param {Array<{name: string, data: Uint8Array}>} files
 * @returns {Promise<Blob>}
 */
export async function createZip(files) {
  const encoder = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  const { time, day } = dosDateTime(new Date());

  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    const data = file.data instanceof Uint8Array ? file.data : new Uint8Array(file.data);
    const crc = crc32(data);
    const size = data.length;

    const localHeader = new Uint8Array(30);
    const lv = new DataView(localHeader.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0, true);
    lv.setUint16(8, 0, true); // store
    lv.setUint16(10, time, true);
    lv.setUint16(12, day, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true);
    lv.setUint32(22, size, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    localParts.push(localHeader, nameBytes, data);

    const centralHeader = new Uint8Array(46);
    const cv = new DataView(centralHeader.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0, true);
    cv.setUint16(10, 0, true); // store
    cv.setUint16(12, time, true);
    cv.setUint16(14, day, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true);
    centralParts.push(centralHeader, nameBytes);

    offset += localHeader.length + nameBytes.length + size;
  }

  const centralOffset = offset;
  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);

  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, centralOffset, true);

  return new Blob([...localParts, ...centralParts, eocd], { type: "application/zip" });
}

/** Rohe DEFLATE-Daten (ohne zlib-/gzip-Rahmen, wie in ZIP-Einträgen üblich) entpacken. */
async function inflateRaw(compressed) {
  if (typeof DecompressionStream === "undefined") {
    throw new Error(
      "Diese ZIP-Datei ist komprimiert; dieser Browser unterstützt keine Dekomprimierung."
    );
  }
  const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * ZIP-Datei einlesen (Methode "store" oder "deflate").
 * @param {ArrayBuffer|Uint8Array} buffer
 * @returns {Promise<Array<{name: string, data: Uint8Array}>>}
 */
export async function readZip(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  // End-of-Central-Directory-Signatur vom Ende her suchen (Kommentar davor meist leer)
  const maxBack = Math.min(bytes.length, 65557); // 22 Byte EOCD + max. 65535 Byte Kommentar
  let eocdOffset = -1;
  for (let i = bytes.length - 22; i >= bytes.length - maxBack && i >= 0; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) {
    throw new Error("Keine gültige ZIP-Datei (End-of-Central-Directory nicht gefunden).");
  }

  const entryCount = view.getUint16(eocdOffset + 10, true);
  const centralOffset = view.getUint32(eocdOffset + 16, true);

  const decoder = new TextDecoder();
  const entries = [];
  let ptr = centralOffset;
  for (let i = 0; i < entryCount; i++) {
    if (view.getUint32(ptr, true) !== 0x02014b50) {
      throw new Error("ZIP-Datei beschädigt (ungültiger Central-Directory-Eintrag).");
    }
    const method = view.getUint16(ptr + 10, true);
    const compSize = view.getUint32(ptr + 20, true);
    const nameLen = view.getUint16(ptr + 28, true);
    const extraLen = view.getUint16(ptr + 30, true);
    const commentLen = view.getUint16(ptr + 32, true);
    const localOffset = view.getUint32(ptr + 42, true);
    const name = decoder.decode(bytes.subarray(ptr + 46, ptr + 46 + nameLen));

    // Lokalen Header lesen: Name-/Extra-Länge können dort abweichen, erst danach
    // beginnen die eigentlichen Dateidaten.
    const localNameLen = view.getUint16(localOffset + 26, true);
    const localExtraLen = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLen + localExtraLen;
    const compData = bytes.subarray(dataStart, dataStart + compSize);

    let data;
    if (method === 0) {
      data = compData;
    } else if (method === 8) {
      data = await inflateRaw(compData);
    } else {
      throw new Error(`ZIP-Eintrag "${name}" verwendet ein nicht unterstütztes Kompressionsverfahren.`);
    }
    entries.push({ name, data });

    ptr += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}
