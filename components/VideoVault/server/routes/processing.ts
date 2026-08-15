import { Router } from 'express';
import { handleMovieProcessing, handleAudiobookProcessing, handleEbookProcessing } from '../handlers/movie-handler';
import { jobQueue } from '../lib/job-queue';
import { db } from '../db';
import {
  handleMoviesScan,
  handleMoviesProcess,
  handleMoviesBatch,
  handleMoviesRescan,
  handleMoviesRename,
  handleMoviesDelete,
  handleMoviesOrganizeInbox,
  handleMoviesIndex,
  handleMoviesCleanup,
} from './processing-movie-handlers';
import {
  handleAudiobooksScan,
  handleAudiobooksProcess,
  handleAudiobooksBatch,
  handleEbooksScan,
  handleEbooksProcess,
  handleEbooksBatch,
  handleHddExtProcess,
  handleHddExtRescan,
  handleHddExtIndex,
  handleScanAll,
  handleStats,
} from './processing-media-handlers';

const router = Router();

// Movie Processing Routes
router.post('/movies/scan', handleMoviesScan);
router.post('/movies/process', handleMoviesProcess);
router.post('/movies/batch', handleMoviesBatch);
router.post('/movies/rescan', handleMoviesRescan);

// Movie Management Routes
router.post('/movies/rename', handleMoviesRename);
router.post('/movies/delete', handleMoviesDelete);
router.post('/movies/organize-inbox', handleMoviesOrganizeInbox);
router.post('/movies/index', handleMoviesIndex);
router.post('/movies/cleanup', handleMoviesCleanup);

// Audiobook Processing Routes
router.post('/audiobooks/scan', handleAudiobooksScan);
router.post('/audiobooks/process', handleAudiobooksProcess);
router.post('/audiobooks/batch', handleAudiobooksBatch);

// Ebook Processing Routes
router.post('/ebooks/scan', handleEbooksScan);
router.post('/ebooks/process', handleEbooksProcess);
router.post('/ebooks/batch', handleEbooksBatch);

// HDD-ext Processing Routes
router.post('/hdd-ext/process', handleHddExtProcess);
router.post('/hdd-ext/rescan', handleHddExtRescan);
router.post('/hdd-ext/index', handleHddExtIndex);

// Combined Processing Routes
router.post('/scan-all', handleScanAll);
router.get('/stats', handleStats);

// Register Job Handlers
jobQueue.registerHandler('process-movie', async (data) => {
  const result = await handleMovieProcessing(data, {} as any, db);
  try {
    const { generateMoviesIndex } = await import('../lib/startup-tasks');
    await generateMoviesIndex(db);
  } catch {}
  return result;
});

jobQueue.registerHandler('process-audiobook', async (data) => {
  return await handleAudiobookProcessing(data, {} as any, db);
});

jobQueue.registerHandler('process-ebook', async (data) => {
  return await handleEbookProcessing(data, {} as any, db);
});

export default router;
