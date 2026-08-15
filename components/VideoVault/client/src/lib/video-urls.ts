import { Video } from '@/types/video';
import { VideoUrlRegistry } from '@/services/video-url-registry';

function encodePathSegments(urlPath: string): string {
  return urlPath.split('/').map(encodeURIComponent).join('/');
}

export const getVideoSrc = (video: Video): string | undefined => {
  // 1. Check local registry (for newly dropped/imported files not yet uploaded/persisted)
  const localUrl = VideoUrlRegistry.get(video.id);
  if (localUrl) return localUrl;

  // 2. Construct server URL from path
  if (!video.path) return undefined;

  // Mapping for Processed directory
  // DB Path: /home/patrick/VideoVault/Processed/...
  if (video.path.includes('/Processed/')) {
    const parts = video.path.split('/Processed/');
    if (parts.length > 1) {
      // encodeURI to handle spaces and special chars
      return `/media/processed/${parts[1]}`
        .split('/')
        .map(encodeURIComponent)
        .join('/')
        .replace('%2F', '/')
        .replace('%2F', '/');
    }
  }

  // Mapping for Bibliothek (Default Library)
  // DB Path: .../Bibliothek/...
  if (video.path.includes('/Bibliothek/')) {
    const parts = video.path.split('/Bibliothek/');
    if (parts.length > 1) {
      return `/media/${parts[1]}`
        .split('/')
        .map(encodeURIComponent)
        .join('/')
        .replace('%2F', '/')
        .replace('%2F', '/');
    }
  }

  // Mapping for fixtures directory (test data)
  // DB Path: .../fixtures/...
  if (video.path.includes('/fixtures/')) {
    const parts = video.path.split('/fixtures/');
    if (parts.length > 1) {
      return `/fixtures/${parts[1]}`
        .split('/')
        .map(encodeURIComponent)
        .join('/')
        .replace('%2F', '/')
        .replace('%2F', '/');
    }
  }

  // Movies directory (indexed from disk)
  if (video.path.startsWith('movies/')) {
    return encodePathSegments(`/media/${video.path}`);
  }

  // HDD-ext directory (indexed from external drive)
  if (video.path.startsWith('hdd-ext/')) {
    return encodePathSegments(`/media/${video.path}`);
  }

  // Browse page: paths already include /media/ prefix
  if (video.path.startsWith('/media/')) {
    return video.path;
  }

  // Basic fallback: if path is absolute but we don't recognize root,
  // we can't serve it unless we map another root.
  // For now, return undefined.
  return undefined;
};

export const getThumbnailSrc = (video: Video): string | undefined => {
  // 1. If DB has a generated dataUrl, use it (unless it is a local file path which browsers block)
  if (video.thumbnail?.generated && video.thumbnail?.dataUrl && !video.thumbnail.dataUrl.startsWith('file://')) {
    return video.thumbnail.dataUrl;
  }

  // 2. Try to construct from path
  if (!video.path) return undefined;
  const baseName = video.filename.replace(/\.[^.]+$/, '');

  // Check if video is in Processed directory by rootKey
  if (video.rootKey?.startsWith('Processed')) {
    // Thumbnails are stored in /media/processed/Thumbnails/
    const path = `/media/processed/Thumbnails/${baseName}-thumb.jpg`;
    return path
      .split('/')
      .map(encodeURIComponent)
      .join('/')
      .replace('%2F', '/')
      .replace('%2F', '/');
  }

  // Legacy path-based check for backwards compatibility
  if (video.path.includes('/Processed/')) {
    const parts = video.path.split('/Processed/');
    if (parts.length > 1) {
      const rel = parts[1];
      const dir = rel.substring(0, rel.lastIndexOf('/'));
      // Construct path relative to /media/processed
      // e.g. /media/processed/Thumbnails/subdir/video-thumb.jpg
      const path = `/media/processed/Thumbnails/${dir ? dir + '/' : ''}${baseName}-thumb.jpg`;
      return path
        .split('/')
        .map(encodeURIComponent)
        .join('/')
        .replace('%2F', '/')
        .replace('%2F', '/');
    }
  }

  if (video.path.includes('/Bibliothek/')) {
    const parts = video.path.split('/Bibliothek/');
    if (parts.length > 1) {
      const rel = parts[1];
      const dir = rel.substring(0, rel.lastIndexOf('/'));
      const path = `/media/${dir ? dir + '/' : ''}${baseName}-thumb.jpg`;
      return path
        .split('/')
        .map(encodeURIComponent)
        .join('/')
        .replace('%2F', '/')
        .replace('%2F', '/');
    }
  }

  // Mapping for fixtures directory (test data)
  if (video.path.includes('/fixtures/')) {
    const parts = video.path.split('/fixtures/');
    if (parts.length > 1) {
      const rel = parts[1];
      const dir = rel.substring(0, rel.lastIndexOf('/'));
      const path = `/fixtures/${dir ? dir + '/' : ''}Thumbnails/${baseName}-thumb.jpg`;
      return path
        .split('/')
        .map(encodeURIComponent)
        .join('/')
        .replace('%2F', '/')
        .replace('%2F', '/');
    }
  }

  // Movies directory (indexed from disk) — uses _thumb.jpg (underscore)
  if (video.path.startsWith('movies/')) {
    const dir = video.path.substring(0, video.path.lastIndexOf('/'));
    return encodePathSegments(`/media/${dir}/Thumbnails/${baseName}_thumb.jpg`);
  }

  // HDD-ext directory — uses _thumb.jpg (underscore, same as movies)
  if (video.path.startsWith('hdd-ext/')) {
    const dir = video.path.substring(0, video.path.lastIndexOf('/'));
    return encodePathSegments(`/media/${dir}/Thumbnails/${baseName}_thumb.jpg`);
  }

  return undefined;
};

export const getSpriteSrc = (video: Video): string | undefined => {
  if (!video.path) return undefined;
  const baseName = video.filename.replace(/\.[^.]+$/, '');

  // Check if video is in Processed directory by rootKey
  if (video.rootKey?.startsWith('Processed')) {
    // Sprites are stored in /media/processed/Thumbnails/
    const path = `/media/processed/Thumbnails/${baseName}-sprite.jpg`;
    return path
      .split('/')
      .map(encodeURIComponent)
      .join('/')
      .replace('%2F', '/')
      .replace('%2F', '/');
  }

  // Legacy path-based check for backwards compatibility
  if (video.path.includes('/Processed/')) {
    const parts = video.path.split('/Processed/');
    if (parts.length > 1) {
      const rel = parts[1];
      const dir = rel.substring(0, rel.lastIndexOf('/'));
      // Processed usually uses -sprite.jpg
      const path = `/media/processed/Thumbnails/${dir ? dir + '/' : ''}${baseName}-sprite.jpg`;
      return path
        .split('/')
        .map(encodeURIComponent)
        .join('/')
        .replace('%2F', '/')
        .replace('%2F', '/');
    }
  }

  if (video.path.includes('/Bibliothek/')) {
    const parts = video.path.split('/Bibliothek/');
    if (parts.length > 1) {
      const rel = parts[1];
      const dir = rel.substring(0, rel.lastIndexOf('/'));
      // Bibliothek usually uses -sprite.jpg
      const path = `/media/${dir ? dir + '/' : ''}${baseName}-sprite.jpg`;
      return path
        .split('/')
        .map(encodeURIComponent)
        .join('/')
        .replace('%2F', '/')
        .replace('%2F', '/');
    }
  }

  // Mapping for fixtures directory (test data)
  if (video.path.includes('/fixtures/')) {
    const parts = video.path.split('/fixtures/');
    if (parts.length > 1) {
      const rel = parts[1];
      const dir = rel.substring(0, rel.lastIndexOf('/'));
      const path = `/fixtures/${dir ? dir + '/' : ''}Thumbnails/${baseName}-sprite.jpg`;
      return path
        .split('/')
        .map(encodeURIComponent)
        .join('/')
        .replace('%2F', '/')
        .replace('%2F', '/');
    }
  }

  // Movies directory (indexed from disk) — uses _sprite.jpg (underscore)
  if (video.path.startsWith('movies/')) {
    const dir = video.path.substring(0, video.path.lastIndexOf('/'));
    return encodePathSegments(`/media/${dir}/Thumbnails/${baseName}_sprite.jpg`);
  }

  // HDD-ext directory — uses _sprite.jpg (underscore, same as movies)
  if (video.path.startsWith('hdd-ext/')) {
    const dir = video.path.substring(0, video.path.lastIndexOf('/'));
    return encodePathSegments(`/media/${dir}/Thumbnails/${baseName}_sprite.jpg`);
  }

  return undefined;
};
