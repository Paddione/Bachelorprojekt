/**
 * Hash Utilities for VideoVault
 *
 * Provides fast hashing for file deduplication and change detection
 * Uses first 64KB + last 64KB + file size for performance
 */

const CHUNK_SIZE = 64 * 1024; // 64KB

/**
 * Calculate fast hash for a file
 *
 * Algorithm:
 * 1. Read first 64KB of file
 * 2. Read last 64KB of file (if file > 64KB)
 * 3. Combine with file size
 * 4. SHA-256 hash the combined data
 *
 * This is much faster than hashing the entire file and still provides
 * good deduplication detection for video files (which are large).
 *
 * @param file - File object to hash
 * @returns Promise<string> - Hex-encoded SHA-256 hash
 */
export async function calculateFastHash(file: File): Promise<string> {
  const chunks: ArrayBuffer[] = [];

  // Read first 64KB
  const firstChunk = await file.slice(0, CHUNK_SIZE).arrayBuffer();
  chunks.push(firstChunk);

  // Read last 64KB (if file is larger than 64KB)
  if (file.size > CHUNK_SIZE) {
    const lastChunk = await file.slice(-CHUNK_SIZE).arrayBuffer();
    chunks.push(lastChunk);
  }

  // Include file size as additional entropy
  const sizeBytes = new TextEncoder().encode(file.size.toString());
  chunks.push(sizeBytes.buffer);

  // Combine all chunks
  const totalLength = chunks.reduce((acc, chunk) => acc + chunk.byteLength, 0);
  const combined = new Uint8Array(totalLength);
  let offset = 0;
  chunks.forEach((chunk) => {
    combined.set(new Uint8Array(chunk), offset);
    offset += chunk.byteLength;
  });

  // Calculate SHA-256 hash
  const hashBuffer = await crypto.subtle.digest('SHA-256', combined);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

  return hashHex;
}

/**
 * Calculate hash from file handle
 *
 * Variant of calculateFastHash that works with FileSystemFileHandle
 *
 * @param fileHandle - FileSystemFileHandle to hash
 * @returns Promise<string> - Hex-encoded SHA-256 hash
 */
export async function calculateFastHashFromHandle(
  fileHandle: FileSystemFileHandle,
): Promise<string> {
  const file = await fileHandle.getFile();
  return calculateFastHash(file);
}

