import { defineMiddleware } from 'astro:middleware';
import { getLocaleFromCookie, defaultLocale, type Locale } from './i18n/index';

const VALID_LOCALES: Locale[] = ['de', 'en'];

export const onRequest = defineMiddleware(async (context, next) => {
  const cookieHeader = context.request.headers.get('cookie') ?? undefined;
  const cookieLocale = getLocaleFromCookie(cookieHeader);
  const locale = cookieLocale && VALID_LOCALES.includes(cookieLocale) ? cookieLocale : defaultLocale;
  context.locals.locale = locale;
  return next();
});
