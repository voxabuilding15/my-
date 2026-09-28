import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  AI_ACTIONS,
  AI_ACTION_QUOTA,
  APP_LOCALES,
  DEFAULT_PLAN_LIMITS,
  DOCUMENT_KINDS,
  PLAN_TIERS,
  QUIZ_QUESTION_TYPES,
  planLimitsSchema,
} from './index.ts';

// Guards against drift between these shared contracts and the SQL migrations.
const migrationsDir = join(import.meta.dirname, '../../../supabase/migrations');
const sql = readdirSync(migrationsDir)
  .filter((file) => file.endsWith('.sql'))
  .sort()
  .map((file) => readFileSync(join(migrationsDir, file), 'utf8'))
  .join('\n');

function enumValues(name: string): string[] {
  const match = new RegExp(`create type public\\.${name} as enum \\(([^;]+)\\);`).exec(sql);
  if (!match?.[1]) throw new Error(`enum ${name} not found in migrations`);
  return [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1] ?? '');
}

const toSnake = (key: string) => key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

describe('database contract', () => {
  it.each([
    ['plan_tier', PLAN_TIERS],
    ['app_locale', APP_LOCALES],
    ['ai_action', AI_ACTIONS],
    ['document_kind', DOCUMENT_KINDS],
    ['quiz_question_type', QUIZ_QUESTION_TYPES],
  ] as const)('enum %s matches the shared constant', (name, values) => {
    expect(enumValues(name)).toEqual([...values]);
  });

  it('plan_limits has a column for every limit in planLimitsSchema', () => {
    const table = /create table public\.plan_limits \(([\s\S]+?)\n\);/.exec(sql)?.[1] ?? '';
    for (const key of Object.keys(planLimitsSchema.shape)) {
      expect(table).toMatch(new RegExp(`\\n\\s+${toSnake(key)} integer`));
    }
  });

  it('seeded plan limits equal DEFAULT_PLAN_LIMITS', () => {
    const insert = /insert into public\.plan_limits \(([^)]+)\) values([\s\S]+?);/.exec(sql);
    const columns = (insert?.[1] ?? '').split(',').map((c) => c.trim());
    const rows = [...(insert?.[2] ?? '').matchAll(/\(([^)]+)\)/g)].map((m) =>
      (m[1] ?? '').split(',').map((v) => v.trim()),
    );
    expect(rows).toHaveLength(PLAN_TIERS.length);
    for (const row of rows) {
      const tier = (row[0] ?? '').replace(/'/g, '') as (typeof PLAN_TIERS)[number];
      const defaults = DEFAULT_PLAN_LIMITS[tier] as Record<string, number | null>;
      for (const [key, expected] of Object.entries(defaults)) {
        const value = row[columns.indexOf(toSnake(key))];
        expect([key, value === 'null' ? null : Number(value)]).toEqual([key, expected]);
      }
    }
  });

  it('every usage metric maps to a counted limit', () => {
    const metricToLimit: Record<string, string> = {
      ai_requests: 'aiRequestsPerDay',
      uploads: 'uploadsPerMonth',
      quizzes: 'quizzesPerDay',
      flashcard_decks: 'flashcardDecksPerDay',
      ocr_scans: 'ocrScansPerDay',
      chat_messages: 'chatMessagesPerDay',
    };
    expect(enumValues('usage_metric')).toEqual(Object.keys(metricToLimit));
    for (const limit of Object.values(AI_ACTION_QUOTA)) {
      expect(Object.values(metricToLimit)).toContain(limit);
    }
  });
});
