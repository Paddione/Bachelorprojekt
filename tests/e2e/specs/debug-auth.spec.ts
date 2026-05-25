import { test, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

const BRETT_URL = 'https://brett.mentolder.de';
const BRETT_STATE_FILE = path.join(__dirname, '..', '.auth', 'mentolder-brett.json');

test('debug auth me', async ({ request }) => {
  const res = await request.get(`${BRETT_URL}/auth/me`);
  console.log('STATUS:', res.status());
  console.log('BODY:', await res.text());
});
