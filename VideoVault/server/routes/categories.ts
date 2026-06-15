import { Request, Response } from 'express';
import { db } from '../db';
import { tags } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';

export async function importCategories(req: Request, res: Response) {
  if (!db) {
    return res.status(503).json({ error: 'Database not configured' });
  }

  const { csv } = req.body as { csv?: unknown };

  if (typeof csv !== 'string') {
    return res.status(400).json({ error: 'CSV content required' });
  }

  const lines = csv.split('\n');
  const imported = [];
  const errors = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Simple CSV parser: type,value
    const parts = trimmed.split(',');
    if (parts.length < 2) {
      // Allow single value, default type to 'general' or 'custom'
      // But spec said "provide a csv.file with categories"
      // Let's assume header or format "type,value"
      continue;
    }

    const type = parts[0].trim();
    const value = parts.slice(1).join(',').trim(); // Handle values with commas? Simple split might strictly break.

    if (!type || !value || type.toLowerCase() === 'type') continue; // Skip header or empty

    try {
      // Check if exists
      const existing = await db
        .select()
        .from(tags)
        .where(eq(tags.name, value)) // Tags table uniqueness is mostly on Name? Or Type+Name?
        // Schema shared/schema.ts says: idxTagsName on name. It doesn't enforce unique name globally.
        // But usually tags are unique by name or type+name.
        // Let's just insert. If we want to avoid dups, we should check.
        // However, schema doesn't have unique constraint on name.
        // Let's check if we should check for duplicates manually.
        .limit(1);

      // Actually, let's look at schema again.
      // id, name, type. No unique constraint on (name, type).
      // But we probably don't want duplicate tags.

      const found = existing.find((t) => t.name === value && t.type === type);

      if (!found) {
        await db.insert(tags).values({
          id: randomUUID(),
          name: value,
          type: type,
          count: 0,
        });
        imported.push({ type, value });
      }
    } catch (e) {
      errors.push({ line: trimmed, error: String(e) });
    }
  }

  res.json({ success: true, imported: imported.length, errors });
}
