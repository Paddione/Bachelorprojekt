import { sequence } from 'astro:middleware';
import { loggingMiddleware } from './logging';

export const onRequest = sequence(loggingMiddleware);
