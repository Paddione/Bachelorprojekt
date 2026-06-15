import { describe, it, expect, beforeEach } from 'vitest';
import { MockFileSystem, createMockVideoStructure, installFileSystemAccessAPIMocks, cleanupFileSystemAccessAPIMocks } from './fs-api-mock';

declare const showDirectoryPicker: () => Promise<FileSystemDirectoryHandle>;
declare const showOpenFilePicker: () => Promise<FileSystemFileHandle[]>;
declare const showSaveFilePicker: () => Promise<FileSystemFileHandle>;

describe('File System Access API Mocks', () => {
  let mockFS: MockFileSystem;

  beforeEach(() => {
    cleanupFileSystemAccessAPIMocks();
    mockFS = installFileSystemAccessAPIMocks();
  });

  describe('MockFileSystem', () => {
    it('creates and manages file structure', () => {
      mockFS.addDirectory('videos');
      mockFS.addFile('videos/test.mp4', 'video content');

      expect(mockFS.directoryExists('videos')).toBe(true);
      expect(mockFS.fileExists('videos/test.mp4')).toBe(true);
      expect(mockFS.fileExists('videos/missing.mp4')).toBe(false);
    });

    it('lists files in directory', () => {
      mockFS.addDirectory('media');
      mockFS.addFile('media/video1.mp4', 'content1');
      mockFS.addFile('media/video2.avi', 'content2');
      mockFS.addDirectory('media/subdir');

      const files = mockFS.listFiles('media');
      expect(files).toEqual(['video1.mp4', 'video2.avi']);
    });

    it('handles nested directory structure', () => {
      mockFS.addDirectory('root/sub1/sub2');
      mockFS.addFile('root/sub1/sub2/deep.mp4', 'deep content');

      expect(mockFS.directoryExists('root')).toBe(true);
      expect(mockFS.directoryExists('root/sub1')).toBe(true);
      expect(mockFS.directoryExists('root/sub1/sub2')).toBe(true);
      expect(mockFS.fileExists('root/sub1/sub2/deep.mp4')).toBe(true);
    });
  });

  describe('MockFileSystemFileHandle', () => {
    it('returns file with correct metadata', async () => {
      mockFS.addFile('test.mp4', 'test content', 12345);
      const rootHandle = mockFS.getRootHandle();
      const fileHandle = await rootHandle.getFileHandle('test.mp4');
      
      const file = await fileHandle.getFile();
      expect(file.name).toBe('test.mp4');
      expect(file.type).toBe('video/mp4');
      expect(file.size).toBe(12345);
    });

    it('supports writing to files', async () => {
      mockFS.addFile('editable.txt', 'original');
      const rootHandle = mockFS.getRootHandle();
      const fileHandle = await rootHandle.getFileHandle('editable.txt');
      
      const writable = await fileHandle.createWritable();
      await writable.write('new content');
      await writable.close();
      
      // Verify the content was updated in the mock filesystem
      const updatedEntry = mockFS.root.children!['editable.txt'];
      expect(updatedEntry.content).toBe('new content');
    });

    it('supports move operation', async () => {
      mockFS.addFile('original.mp4', 'content');
      const rootHandle = mockFS.getRootHandle();
      const fileHandle = (await rootHandle.getFileHandle('original.mp4')) as any;
      
      if (fileHandle.move) {
        await fileHandle.move('renamed.mp4');
      }
      
      expect(fileHandle.name).toBe('renamed.mp4');
    });
  });

  describe('MockFileSystemDirectoryHandle', () => {
    it('iterates over directory contents', async () => {
      mockFS.addFile('file1.mp4', 'content1');
      mockFS.addFile('file2.avi', 'content2');
      mockFS.addDirectory('subdir');
      
      const rootHandle = mockFS.getRootHandle();
      const entries: [string, FileSystemHandle][] = [];
      
      for await (const entry of rootHandle.entries()) {
        entries.push(entry);
      }
      
      expect(entries).toHaveLength(3);
      const names = entries.map(([name]) => name);
      expect(names).toContain('file1.mp4');
      expect(names).toContain('file2.avi');
      expect(names).toContain('subdir');
    });

    it('creates new files and directories', async () => {
      const rootHandle = mockFS.getRootHandle();
      
      const newFileHandle = await rootHandle.getFileHandle('new.txt', { create: true });
      expect(newFileHandle.name).toBe('new.txt');
      expect(mockFS.fileExists('new.txt')).toBe(true);
      
      const newDirHandle = await rootHandle.getDirectoryHandle('newdir', { create: true });
      expect(newDirHandle.name).toBe('newdir');
      expect(mockFS.directoryExists('newdir')).toBe(true);
    });

    it('removes entries', async () => {
      mockFS.addFile('toDelete.mp4', 'content');
      mockFS.addDirectory('toDeleteDir');
      
      const rootHandle = mockFS.getRootHandle();
      
      await rootHandle.removeEntry('toDelete.mp4');
      expect(mockFS.fileExists('toDelete.mp4')).toBe(false);
      
      await rootHandle.removeEntry('toDeleteDir');
      expect(mockFS.directoryExists('toDeleteDir')).toBe(false);
    });

    it('handles non-empty directory removal with recursive option', async () => {
      mockFS.addDirectory('parentDir');
      mockFS.addFile('parentDir/child.txt', 'content');
      
      const rootHandle = mockFS.getRootHandle();
      
      // Should throw without recursive option
      await expect(rootHandle.removeEntry('parentDir'))
        .rejects.toThrow('Directory not empty');
      
      // Should succeed with recursive option
      await rootHandle.removeEntry('parentDir', { recursive: true });
      expect(mockFS.directoryExists('parentDir')).toBe(false);
    });
  });

  describe('Global API mocks', () => {
    it('mocks showDirectoryPicker', async () => {
      const handle = await showDirectoryPicker();
      expect(handle).toBeDefined();
      expect(handle.kind).toBe('directory');
    });

    it('mocks showOpenFilePicker', async () => {
      mockFS.addFile('test1.mp4', 'content1');
      mockFS.addFile('test2.avi', 'content2');
      
      const handles = await showOpenFilePicker();
      expect(handles).toHaveLength(2);
      expect(handles.every((h: FileSystemHandle) => h.kind === 'file')).toBe(true);
    });

    it('mocks showSaveFilePicker', async () => {
      const handle = await showSaveFilePicker();
      expect(handle).toBeDefined();
      expect(handle.kind).toBe('file');
      expect(handle.name).toBe('new-file.txt');
    });
  });

  describe('createMockVideoStructure', () => {
    it('creates realistic video file structure', () => {
      const videoFS = createMockVideoStructure();
      
      expect(videoFS.directoryExists('Videos')).toBe(true);
      expect(videoFS.fileExists('Videos/sample1.mp4')).toBe(true);
      expect(videoFS.fileExists('Videos/sample2.avi')).toBe(true);
      expect(videoFS.fileExists('Videos/sample3.mkv')).toBe(true);
      expect(videoFS.directoryExists('Videos/Subdirectory')).toBe(true);
      expect(videoFS.fileExists('Videos/Subdirectory/nested.mp4')).toBe(true);
      
      const rootFiles = videoFS.listFiles('Videos');
      expect(rootFiles).toContain('sample1.mp4');
      expect(rootFiles).toContain('sample2.avi');
      expect(rootFiles).toContain('sample3.mkv');
    });

    it('creates files with realistic sizes', async () => {
      const videoFS = createMockVideoStructure();
      const rootHandle = videoFS.getRootHandle();
      const videosHandle = await rootHandle.getDirectoryHandle('Videos');
      const fileHandle = await videosHandle.getFileHandle('sample1.mp4');
      
      const file = await fileHandle.getFile();
      expect(file.size).toBe(1024 * 1024 * 100); // 100MB
    });
  });

  describe('Error handling', () => {
    it('throws appropriate errors for missing files', async () => {
      const rootHandle = mockFS.getRootHandle();
      
      await expect(rootHandle.getFileHandle('missing.txt'))
        .rejects.toThrow('File not found');
      
      await expect(rootHandle.getDirectoryHandle('missing'))
        .rejects.toThrow('Directory not found');
    });

    it('throws appropriate errors for type mismatches', async () => {
      mockFS.addFile('notdir.txt', 'content');
      mockFS.addDirectory('notfile');
      
      const rootHandle = mockFS.getRootHandle();
      
      await expect(rootHandle.getDirectoryHandle('notdir.txt'))
        .rejects.toThrow('Not a directory');
      
      await expect(rootHandle.getFileHandle('notfile'))
        .rejects.toThrow('Not a file');
    });

    it('handles write stream errors', async () => {
      mockFS.addFile('test.txt', 'content');
      const rootHandle = mockFS.getRootHandle();
      const fileHandle = await rootHandle.getFileHandle('test.txt');
      
      const writable = await fileHandle.createWritable();
      await writable.close();
      
      // Writing to closed stream should throw
      await expect(writable.write('data'))
        .rejects.toThrow('The stream is closed');
    });
  });
});
