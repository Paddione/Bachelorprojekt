import path from 'path';
import fs from 'fs/promises';
import { spawn } from 'child_process';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { logger } from '../lib/logger';
import type { JobContext } from '../lib/enhanced-job-queue';

// Note: Using spawn instead of exec for security - spawn doesn't use shell interpolation

// Supported ebook file extensions
const EBOOK_EXTENSIONS = ['.epub', '.pdf', '.mobi', '.azw3', '.cbz', '.cbr', '.txt'];

export interface EbookJobPayload {
  inputPath: string;
  ebookId?: string;
  rootKey?: string;
  autoOrganize?: boolean;
}

export interface EbookFile {
  format: string;
  path: string;
  fileSize: number;
}

export interface EbookMetadata {
  title: string;
  author: string;
  publisher?: string;
  publishDate?: string;
  isbn?: string;
  series?: string;
  seriesIndex?: number;
  description?: string;
  language?: string;
  pageCount?: number;
  subjects?: string[];
  calibreId?: string;
  calibreTimestamp?: string;
}

/**
 * Parse author and title from ebook folder name
 * Common Calibre patterns:
 * - "Author Name/Book Title (ID)"
 * - "Author Name - Book Title"
 */
function parseEbookFolder(folderPath: string): { title: string; author: string } {
  const folderName = path.basename(folderPath);
  const parentName = path.basename(path.dirname(folderPath));

  // Calibre pattern: Parent folder is author, current folder is "Title (ID)"
  if (parentName && !parentName.includes('/')) {
    // Remove trailing ID like (123)
    const cleanTitle = folderName.replace(/\s*\(\d+\)\s*$/, '').trim();
    return {
      author: parentName,
      title: cleanTitle,
    };
  }

  // Try common separators in folder name
  const separators = [' - ', ' – ', ' — '];
  for (const sep of separators) {
    if (folderName.includes(sep)) {
      const parts = folderName.split(sep);
      if (parts.length === 2) {
        return {
          author: parts[0].trim(),
          title: parts[1].trim().replace(/\s*\(\d+\)\s*$/, ''),
        };
      }
    }
  }

  // Fallback
  return {
    title: folderName.replace(/\s*\(\d+\)\s*$/, '').trim(),
    author: 'Unknown Author',
  };
}

/**
 * Generate organized folder path for an ebook
 * Format: Author/Title/
 */
function generateOrganizedPath(author: string, title: string): string {
  const sanitize = (s: string) => s.replace(/[<>:"/\\|?*]/g, '').trim();
  return path.join(sanitize(author), sanitize(title));
}

/**
 * Parse OPF metadata file (Calibre metadata)
 */
async function parseOPFMetadata(opfPath: string): Promise<Partial<EbookMetadata>> {
  try {
    const content = await fs.readFile(opfPath, 'utf-8');
    const metadata: Partial<EbookMetadata> = {};

    // Extract title
    const titleMatch = content.match(/<dc:title[^>]*>([^<]+)<\/dc:title>/i);
    if (titleMatch) metadata.title = titleMatch[1].trim();

    // Extract author
    const authorMatch = content.match(/<dc:creator[^>]*>([^<]+)<\/dc:creator>/i);
    if (authorMatch) metadata.author = authorMatch[1].trim();

    // Extract publisher
    const publisherMatch = content.match(/<dc:publisher[^>]*>([^<]+)<\/dc:publisher>/i);
    if (publisherMatch) metadata.publisher = publisherMatch[1].trim();

    // Extract date
    const dateMatch = content.match(/<dc:date[^>]*>([^<]+)<\/dc:date>/i);
    if (dateMatch) metadata.publishDate = dateMatch[1].trim();

    // Extract description
    const descMatch = content.match(/<dc:description[^>]*>([^<]+)<\/dc:description>/i);
    if (descMatch) metadata.description = descMatch[1].trim();

    // Extract language
    const langMatch = content.match(/<dc:language[^>]*>([^<]+)<\/dc:language>/i);
    if (langMatch) metadata.language = langMatch[1].trim();

    // Extract ISBN
    const isbnMatch = content.match(/<dc:identifier[^>]*opf:scheme="ISBN"[^>]*>([^<]+)<\/dc:identifier>/i);
    if (isbnMatch) metadata.isbn = isbnMatch[1].trim();

    // Extract subjects/tags
    const subjects: string[] = [];
    const subjectRegex = /<dc:subject[^>]*>([^<]+)<\/dc:subject>/gi;
    let subjectMatch;
    while ((subjectMatch = subjectRegex.exec(content)) !== null) {
      subjects.push(subjectMatch[1].trim());
    }
    if (subjects.length > 0) metadata.subjects = subjects;

    // Extract series (from Calibre meta)
    const seriesMatch = content.match(/<meta\s+name="calibre:series"\s+content="([^"]+)"/i);
    if (seriesMatch) metadata.series = seriesMatch[1].trim();

    const seriesIndexMatch = content.match(/<meta\s+name="calibre:series_index"\s+content="([^"]+)"/i);
    if (seriesIndexMatch) metadata.seriesIndex = parseFloat(seriesIndexMatch[1]);

    // Extract Calibre ID
    const calibreIdMatch = content.match(/<dc:identifier[^>]*opf:scheme="calibre"[^>]*>([^<]+)<\/dc:identifier>/i);
    if (calibreIdMatch) metadata.calibreId = calibreIdMatch[1].trim();

    return metadata;
  } catch (error: any) {
    logger.warn(`[EbookHandler] Failed to parse OPF: ${opfPath}`, { error: error.message });
    return {};
  }
}

/**
 * Extract cover from EPUB using unzip (spawn is safe - no shell interpolation)
 */
async function extractEpubCover(epubPath: string, outputPath: string): Promise<boolean> {
  return new Promise((resolve) => {
    // Try to extract cover.jpg or cover.jpeg from EPUB
    const coverNames = ['cover.jpg', 'cover.jpeg', 'cover.png', 'Images/cover.jpg', 'OEBPS/cover.jpg', 'OEBPS/Images/cover.jpg'];

    const tryExtract = async (index: number): Promise<boolean> => {
      if (index >= coverNames.length) return false;

      const coverName = coverNames[index];
      // Using spawn (not exec) - arguments are passed as array, preventing shell injection
      const proc = spawn('unzip', ['-p', epubPath, coverName], { stdio: ['ignore', 'pipe', 'ignore'] });

      const chunks: Buffer[] = [];
      proc.stdout.on('data', (chunk) => chunks.push(chunk));

      return new Promise((res) => {
        proc.on('close', async (code) => {
          if (code === 0 && chunks.length > 0) {
            await fs.writeFile(outputPath, Buffer.concat(chunks));
            res(true);
          } else {
            res(await tryExtract(index + 1));
          }
        });
        proc.on('error', () => res(tryExtract(index + 1)));
      });
    };

    tryExtract(0).then(resolve);
  });
}

/**
 * Extract cover from PDF using pdftoppm (poppler-utils)
 * Using spawn is safe - no shell interpolation
 */
async function extractPdfCover(pdfPath: string, outputPath: string): Promise<boolean> {
  return new Promise((resolve) => {
    // Arguments passed as array to spawn - safe from shell injection
    const args = [
      '-f', '1',
      '-l', '1',
      '-jpeg',
      '-scale-to', '600',
      pdfPath,
      outputPath.replace(/\.jpg$/, ''),
    ];

    const proc = spawn('pdftoppm', args, { stdio: 'ignore' });
    proc.on('close', async (code) => {
      // pdftoppm adds -1.jpg suffix
      const actualOutput = outputPath.replace(/\.jpg$/, '-1.jpg');
      try {
        await fs.access(actualOutput);
        await fs.rename(actualOutput, outputPath);
        resolve(true);
      } catch {
        resolve(false);
      }
    });
    proc.on('error', () => resolve(false));
  });
}

/**
 * Find cover image in ebook folder
 */
async function findCoverImage(folderPath: string): Promise<string | null> {
  const coverNames = ['cover.jpg', 'cover.jpeg', 'cover.png', 'folder.jpg', 'folder.jpeg'];

  for (const coverName of coverNames) {
    const coverPath = path.join(folderPath, coverName);
    try {
      await fs.access(coverPath);
      return coverPath;
    } catch {
      // Continue searching
    }
  }

  return null;
}

/**
 * Calculate folder hash
 */
async function calculateFolderHash(folderPath: string): Promise<string> {
  const hash = crypto.createHash('sha256');
  const entries = await fs.readdir(folderPath, { withFileTypes: true });

  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (EBOOK_EXTENSIONS.includes(ext)) {
        hash.update(entry.name);
        const stats = await fs.stat(path.join(folderPath, entry.name));
        hash.update(stats.size.toString());
      }
    }
  }

  return hash.digest('hex');
}

/**
 * Main Ebook Processing Handler
 */
export async function handleEbookProcessing(
  data: EbookJobPayload,
  context: JobContext,
  db: any,
) {
  const { inputPath, ebookId, rootKey, autoOrganize = true } = data;
  const EBOOKS_DIR = process.env.EBOOKS_DIR || path.join(process.cwd(), 'media', 'ebooks');

  logger.info(`[EbookHandler] Processing ebook: ${inputPath}`, { ebookId, rootKey });

  try {
    // 1. Verify folder exists
    const stats = await fs.stat(inputPath);
    if (!stats.isDirectory()) {
      throw new Error('Input path must be a directory');
    }

    // 2. Parse author and title from folder structure
    let { author, title } = parseEbookFolder(inputPath);

    // 3. Scan for ebook files and OPF
    const entries = await fs.readdir(inputPath, { withFileTypes: true });
    const ebookFiles: EbookFile[] = [];
    let opfPath: string | null = null;

    for (const entry of entries) {
      if (!entry.isFile()) continue;

      const ext = path.extname(entry.name).toLowerCase();
      if (EBOOK_EXTENSIONS.includes(ext)) {
        const filePath = path.join(inputPath, entry.name);
        const fileStats = await fs.stat(filePath);
        ebookFiles.push({
          format: ext.substring(1), // Remove leading dot
          path: entry.name,
          fileSize: fileStats.size,
        });
      } else if (ext === '.opf') {
        opfPath = path.join(inputPath, entry.name);
      }
    }

    if (ebookFiles.length === 0) {
      throw new Error('No ebook files found in directory');
    }

    logger.info(`[EbookHandler] Found ${ebookFiles.length} ebook files`, { title, author, formats: ebookFiles.map((f) => f.format) });

    // 4. Parse OPF metadata if available
    let opfMetadata: Partial<EbookMetadata> = {};
    if (opfPath) {
      opfMetadata = await parseOPFMetadata(opfPath);
      // Override folder-based metadata with OPF data
      if (opfMetadata.title) title = opfMetadata.title;
      if (opfMetadata.author) author = opfMetadata.author;
    }

    // 5. Calculate folder hash
    const folderHash = await calculateFolderHash(inputPath);

    // 6. Organize file if autoOrganize is enabled
    let finalPath = inputPath;
    let relativePath = path.relative(EBOOKS_DIR, inputPath);

    if (autoOrganize) {
      const organizedFolder = generateOrganizedPath(author, title);
      const targetDir = path.join(EBOOKS_DIR, organizedFolder);

      if (inputPath !== targetDir && !inputPath.startsWith(targetDir)) {
        // Create target directory
        await fs.mkdir(path.dirname(targetDir), { recursive: true });

        // Move the folder
        try {
          await fs.rename(inputPath, targetDir);
          finalPath = targetDir;
          relativePath = path.relative(EBOOKS_DIR, targetDir);
          logger.info(`[EbookHandler] Organized: ${inputPath} -> ${targetDir}`);
        } catch (moveError: any) {
          logger.warn(`[EbookHandler] Could not move folder: ${moveError.message}`);
        }
      }
    }

    // 7. Extract or find cover image
    const thumbsDir = path.join(finalPath, 'Thumbnails');
    await fs.mkdir(thumbsDir, { recursive: true });

    let coverPath = await findCoverImage(finalPath);
    const coverOutput = path.join(thumbsDir, 'cover.jpg');

    if (!coverPath) {
      // Try to extract from EPUB first
      const epubFile = ebookFiles.find((f) => f.format === 'epub');
      if (epubFile) {
        const extracted = await extractEpubCover(path.join(finalPath, epubFile.path), coverOutput);
        if (extracted) {
          coverPath = coverOutput;
        }
      }

      // Try PDF if no EPUB cover
      if (!coverPath) {
        const pdfFile = ebookFiles.find((f) => f.format === 'pdf');
        if (pdfFile) {
          const extracted = await extractPdfCover(path.join(finalPath, pdfFile.path), coverOutput);
          if (extracted) {
            coverPath = coverOutput;
          }
        }
      }
    } else {
      // Copy existing cover to Thumbnails
      await fs.copyFile(coverPath, coverOutput);
      coverPath = coverOutput;
    }

    // 8. Calculate total size
    const totalSize = ebookFiles.reduce((acc, f) => acc + f.fileSize, 0);

    // 9. Build metadata
    const metadata: EbookMetadata = {
      title,
      author,
      publisher: opfMetadata.publisher,
      publishDate: opfMetadata.publishDate,
      isbn: opfMetadata.isbn,
      series: opfMetadata.series,
      seriesIndex: opfMetadata.seriesIndex,
      description: opfMetadata.description,
      language: opfMetadata.language,
      subjects: opfMetadata.subjects,
      calibreId: opfMetadata.calibreId,
      calibreTimestamp: opfMetadata.calibreTimestamp,
    };

    // 10. Store in database (if available)
    const id = ebookId || uuidv4();

    logger.info(`[EbookHandler] Successfully processed ebook: ${title}`, {
      id,
      author,
      formats: ebookFiles.map((f) => f.format),
    });

    return {
      status: 'completed',
      ebookId: id,
      title,
      author,
      path: finalPath,
      coverPath: coverPath ? path.relative(EBOOKS_DIR, coverPath) : null,
      files: ebookFiles,
      metadata,
      totalSize,
    };
  } catch (error: any) {
    logger.error(`[EbookHandler] Failed to process ebook: ${inputPath}`, {
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
}

/**
 * Scan ebooks directory and return list of ebook folders
 */
export async function scanEbooksDirectory(
  directory?: string,
): Promise<Array<{ path: string; name: string; formats: string[] }>> {
  const EBOOKS_DIR = directory || process.env.EBOOKS_DIR || path.join(process.cwd(), 'media', 'ebooks');
  const ebooks: Array<{ path: string; name: string; formats: string[] }> = [];

  async function scanDir(dir: string, depth = 0): Promise<void> {
    if (depth > 3) return; // Limit recursion depth

    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      // Check if current directory contains ebook files
      const ebookFiles = entries.filter(
        (e) => e.isFile() && EBOOK_EXTENSIONS.includes(path.extname(e.name).toLowerCase()),
      );

      if (ebookFiles.length > 0) {
        const formats = [...new Set(ebookFiles.map((f) => path.extname(f.name).substring(1).toLowerCase()))];
        ebooks.push({
          path: dir,
          name: path.basename(dir),
          formats,
        });
        return; // Don't recurse into ebook folders
      }

      // Recurse into subdirectories
      for (const entry of entries) {
        if (entry.isDirectory() && entry.name !== 'Thumbnails') {
          await scanDir(path.join(dir, entry.name), depth + 1);
        }
      }
    } catch (error: any) {
      logger.warn(`[EbookHandler] Failed to scan directory: ${dir}`, { error: error.message });
    }
  }

  await scanDir(EBOOKS_DIR);
  return ebooks;
}
