import fs from 'fs/promises';
import crypto from 'crypto';
import { spawn } from 'child_process';

const CHUNK_SIZE = 16 * 1024; // 16KB

export async function computeFastHash(filePath: string): Promise<string> {
    let handle;
    try {
        handle = await fs.open(filePath, 'r');
        const stat = await handle.stat();
        const fileSize = stat.size;

        // If file is smaller than 2 chunks, read the whole thing
        const readSize = Math.min(fileSize, CHUNK_SIZE);
        const buffer = Buffer.alloc(readSize * 2);

        // Read start
        await handle.read(buffer, 0, readSize, 0);

        // Read end (if file is large enough)
        if (fileSize > readSize) {
            const offset = Math.max(0, fileSize - readSize);
            await handle.read(buffer, readSize, readSize, offset);
        }

        const hash = crypto.createHash('md5');
        hash.update(fileSize.toString());
        hash.update(buffer);
        return hash.digest('hex');
    } catch (error) {
        console.error(`Failed to compute fast hash for ${filePath}:`, error);
        return '';
    } finally {
        if (handle) await handle.close();
    }
}

function runFFprobe(filePath: string): Promise<number> {
    return new Promise((resolve, reject) => {
        const args = [
            '-v', 'error',
            '-select_streams', 'v:0',
            '-show_entries', 'format=duration',
            '-of', 'default=noprint_wrappers=1:nokey=1',
            filePath,
        ];
        const p = spawn('ffprobe', args);
        let out = '';
        p.stdout.on('data', (d) => (out += d.toString()));
        p.on('close', (code) => {
            if (code === 0) {
                const sec = parseFloat(out);
                resolve(Number.isFinite(sec) ? sec : 0);
            } else {
                resolve(0); // Fail gracefully
            }
        });
        p.on('error', () => resolve(0));
    });
}

export async function computePhash(filePath: string): Promise<string> {
    try {
        const duration = await runFFprobe(filePath);
        if (duration <= 0) return '';

        const timestamp = duration * 0.5; // Middle of the video

        // dHash implementation: 9x8 grayscale
        const args = [
            '-ss', timestamp.toFixed(2),
            '-i', filePath,
            '-frames:v', '1',
            '-vf', 'scale=9:8,format=gray',
            '-f', 'rawvideo',
            '-'
        ];

        return new Promise((resolve) => {
            const p = spawn('ffmpeg', args);
            const chunks: Buffer[] = [];

            p.stdout.on('data', (chunk) => chunks.push(chunk));

            p.on('close', (code) => {
                if (code !== 0) {
                    resolve('');
                    return;
                }

                const buffer = Buffer.concat(chunks);
                if (buffer.length !== 72) { // 9 * 8 = 72 bytes
                    resolve('');
                    return;
                }

                let hash = '';
                for (let y = 0; y < 8; y++) {
                    let rowHash = 0;
                    for (let x = 0; x < 8; x++) {
                        const left = buffer[y * 9 + x];
                        const right = buffer[y * 9 + x + 1];
                        if (left > right) {
                            rowHash |= (1 << x);
                        }
                    }
                    hash += rowHash.toString(16).padStart(2, '0');
                }
                resolve(hash);
            });

            p.on('error', () => resolve(''));
        });
    } catch (error) {
        console.error(`Failed to compute phash for ${filePath}:`, error);
        return '';
    }
}
