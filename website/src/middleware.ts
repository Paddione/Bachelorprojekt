import { defineMiddleware, sequence } from 'astro:middleware';
import { getLocaleFromCookie, defaultLocale, type Locale } from './i18n/index';
import { loggingMiddleware } from './middleware/logging';

const VALID_LOCALES: Locale[] = ['de', 'en'];

const localeMiddleware = defineMiddleware(async (context, next) => {
  const cookieHeader = context.request.headers.get('cookie') ?? undefined;
  const cookieLocale = getLocaleFromCookie(cookieHeader);
  const locale = cookieLocale && VALID_LOCALES.includes(cookieLocale) ? cookieLocale : defaultLocale;
  context.locals.locale = locale;
  return next();
});

export const onRequest = sequence(loggingMiddleware, localeMiddleware);
