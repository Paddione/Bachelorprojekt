import { defineMiddleware, sequence } from 'astro:middleware';
import { getLocaleFromCookie, defaultLocale, type Locale } from './i18n/index';
import { loggingMiddleware } from './middleware/logging';
import { resolveRedirect } from './middleware/redirect-map';

const VALID_LOCALES: Locale[] = ['de', 'en'];

const localeMiddleware = defineMiddleware(async (context, next) => {
  const cookieHeader = context.request.headers.get('cookie') ?? undefined;
  const cookieLocale = getLocaleFromCookie(cookieHeader);
  const locale = cookieLocale && VALID_LOCALES.includes(cookieLocale) ? cookieLocale : defaultLocale;
  context.locals.locale = locale;
  return next();
});

const redirectMiddleware = defineMiddleware(async (context, next) => {
  const target = resolveRedirect(context.url.pathname);
  if (target) return context.redirect(target, 301);
  return next();
});

export const onRequest = sequence(loggingMiddleware, redirectMiddleware, localeMiddleware);
