import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { createProject } from '../../../../lib/projects-db';
import { siteRedirect } from '../../../../lib/redirect';
import { getTemplate, materializeTemplate } from '../../../../lib/folder-templates-db';

export const POST: APIRoute = async ({ request , locals }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(null, { status: 403 });

  const form = await request.formData();
  const brand             = form.get('brand')?.toString().trim()             ?? (process.env.BRAND || 'mentolder');
  const name              = form.get('name')?.toString().trim()              ?? '';
  const description       = form.get('description')?.toString().trim()       ?? '';
  const notes             = form.get('notes')?.toString().trim()             ?? '';
  const startDate         = form.get('startDate')?.toString()                ?? '';
  const dueDate           = form.get('dueDate')?.toString()                  ?? '';
  const status            = form.get('status')?.toString()                   || 'entwurf';
  const priority          = form.get('priority')?.toString()                 || 'mittel';
  const customerId        = form.get('customerId')?.toString().trim()        ?? '';
  const adminId           = form.get('adminId')?.toString().trim()           ?? '';
  const folderTemplateId  = form.get('folderTemplateId')?.toString().trim()  ?? '';

  if (!name) {
    return siteRedirect('/admin/projekte?error=Name+ist+erforderlich');
  }

  let id: string;
  try {
    id = await createProject({ brand, name, description, notes, startDate, dueDate, status, priority, customerId, adminId });
  } catch (err) {
    locals.requestLogger.error({ err }, '[projekte/create]');
    return siteRedirect('/admin/projekte?error=Datenbankfehler');
  }

  let foldersWarn = false;
  if (folderTemplateId && folderTemplateId !== 'none') {
    try {
      const tmpl = await getTemplate(brand, folderTemplateId);
      if (tmpl) {
        const result = await materializeTemplate(id, tmpl.structure.folders);
        if (result.failed.length > 0) {
          locals.requestLogger.warn({ failed: result.failed }, '[projekte/create] folder creation failed for some paths');
          foldersWarn = true;
        }
      }
    } catch (err) {
      locals.requestLogger.warn({ err }, '[projekte/create] template materialization error');
      foldersWarn = true;
    }
  }

  const qs = `saved=1${foldersWarn ? '&foldersWarn=1' : ''}`;
  return siteRedirect(`/admin/projekte/${id}?${qs}`);
};
