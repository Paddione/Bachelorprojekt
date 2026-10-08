// scripts/toolset/lib/adapters/index.mjs — Adapter-Tabelle (T900791).
import * as claude from './claude.mjs';
import * as opencode from './opencode.mjs';
import * as openclaw from './openclaw.mjs';

export const ADAPTERS = { claude, opencode, openclaw };
