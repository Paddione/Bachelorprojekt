import type { Video } from '@/types/video';
import { ConflictItem } from '@/components/conflict/conflict-resolution-dialog';
import { ConflictDialogState, ResolveDecisions } from './home-queries';

export interface HomeToastFn {
  (opts: { title: string; description?: string; variant?: 'destructive' }): void;
}

export interface HomeOpsContext {
  state: { videos: Video[]; currentVideo: Video | null };
  actions: Record<string, (...args: never[]) => unknown>;
  toast: HomeToastFn;
  showError: (e: Error, opts?: Record<string, unknown>) => void;
  showSuccess: (title: string, desc: string) => void;
  setLocation: (to: string) => void;
}

export async function resolveRenameItems(ctx: HomeOpsContext, dlg: ConflictDialogState, decisions: ResolveDecisions): Promise<void> {
  const applyTo = dlg.applyTo ?? 'both';
  const tasks: Promise<unknown>[] = [];
  for (const item of dlg.items) {
    const strategy = decisions[item.id] ?? 'keep_both';
    if (strategy === 'skip') continue;
    const base = dlg.desiredBaseById?.[item.id] ?? item.desiredFileName.replace(/\.[^./]+$/, '');
    tasks.push((ctx.actions.renameVideo as (id: string, n: string, a: string, o: object) => Promise<{ success: boolean; message?: string }>)(
      item.id, base, applyTo,
      { overwrite: strategy === 'overwrite', conflictStrategy: strategy === 'keep_both' ? 'keep_both' : undefined },
    ).then((res) => {
      if (!res.success) ctx.toast({ title: 'Rename failed', description: res.message || 'Unable to rename file.', variant: 'destructive' });
    }));
  }
  await Promise.all(tasks);
}

export async function resolveMoveItems(ctx: HomeOpsContext, dlg: ConflictDialogState, decisions: ResolveDecisions): Promise<void> {
  if (!dlg.targetDir) return;
  const dir = dlg.targetDir;
  const tasks: Promise<unknown>[] = [];
  for (const item of dlg.items) {
    const strategy = decisions[item.id] ?? 'keep_both';
    if (strategy === 'skip') continue;
    tasks.push((ctx.actions.moveFileToDirectory as (id: string, d: string, o: object) => Promise<{ success: boolean; message?: string }>)(
      item.id, dir,
      { overwrite: strategy === 'overwrite', conflictStrategy: strategy === 'keep_both' ? 'keep_both' : undefined },
    ).then((res) => {
      if (!res.success) ctx.toast({ title: 'Move failed', description: res.message || 'Unable to move file.', variant: 'destructive' });
    }));
  }
  await Promise.all(tasks);
}

