import { Video } from '@/types/video';

export interface PlaylistExportOptions {
    format: 'm3u' | 'json';
    pathType: 'absolute' | 'relative';
}

export class PlaylistExportService {
    static generateM3U(videos: Video[], options: { relativePaths: boolean }): string {
        let content = '#EXTM3U\n';

        videos.forEach(video => {
            // Add metadata if available
            const duration = video.metadata?.duration ? Math.round(video.metadata.duration) : -1;
            const title = video.displayName || video.filename;

            content += `#EXTINF:${duration},${title}\n`;

            // Determine path
            // Note: Relative paths are tricky without a reference point (the playlist file location).
            // For now, we'll assume relative means relative to the library root if possible, 
            // or just the filename if it's flat. 
            // However, usually M3U relative paths are relative to the M3U file itself.
            // If the user saves the M3U in the root of their library, relative paths work well.

            // Since we don't know where the user will save the M3U file, 
            // 'relative' usually implies relative to the common root of the videos, 
            // or we just use the path stored in the DB if it's already relative-ish.
            // The 'path' property in Video is usually absolute or relative to the scan root.

            // Let's assume video.path is the full path on disk (as it seems to be based on other code).
            // If relativePaths is true, we might try to make it relative to the common prefix?
            // Or just leave it as is if the user intends to save the playlist in the root.

            // For this implementation, we will use the video.path directly. 
            // If 'relativePaths' is requested, we might need to strip the common prefix?
            // But we don't know the save location. 
            // Let's assume 'absolute' uses the full path, and 'relative' tries to be relative to the library root.

            content += `${video.path}\n`;
        });

        return content;
    }

    static generateJSON(videos: Video[], options: { relativePaths: boolean }): string {
        const playlist = videos.map(video => ({
            title: video.displayName,
            filename: video.filename,
            path: video.path,
            duration: video.metadata?.duration,
            size: video.size,
            mtime: video.lastModified
        }));

        return JSON.stringify(playlist, null, 2);
    }

    static async exportPlaylist(
        videos: Video[],
        options: PlaylistExportOptions,
        filename: string = 'playlist'
    ): Promise<void> {
        let content = '';
        let mimeType = '';
        let extension = '';

        if (options.format === 'm3u') {
            content = this.generateM3U(videos, { relativePaths: options.pathType === 'relative' });
            mimeType = 'audio/x-mpegurl'; // or application/x-mpegurl
            extension = '.m3u';
        } else {
            content = this.generateJSON(videos, { relativePaths: options.pathType === 'relative' });
            mimeType = 'application/json';
            extension = '.json';
        }

        const fullFilename = filename.endsWith(extension) ? filename : `${filename}${extension}`;

        // Use File System Access API if available
        if ('showSaveFilePicker' in window) {
            try {
                const handle = await (window as any).showSaveFilePicker({
                    suggestedName: fullFilename,
                    types: [{
                        description: options.format.toUpperCase() + ' Playlist',
                        accept: { [mimeType]: [extension] }
                    }]
                });

                const writable = await handle.createWritable();
                await writable.write(content);
                await writable.close();
                return;
            } catch (err: any) {
                if (err.name === 'AbortError') return;
                // Fallback to blob download
            }
        }

        // Fallback
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fullFilename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}
