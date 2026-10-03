// ===== バックアップと復元（端末の買いかえ・機種変更用） =====
import { db } from './db';
import { aiUsage, profile, settings } from './store';
import { reloadRegistry } from '../content/registry';

const TABLES = ['attempts', 'cards', 'sessions', 'packs', 'diagnostics', 'abilities', 'abilityHistory', 'daily', 'kv', 'aiCache'] as const;

export async function exportAll(includeKeys = false) {
  const s = structuredClone(settings.get());
  if (!includeKeys) s.ai.providers = s.ai.providers.map((p) => ({ ...p, apiKey: '' }));
  const tables: Record<string, unknown[]> = {};
  for (const t of TABLES) tables[t] = await (db as unknown as Record<string, { toArray(): Promise<unknown[]> }>)[t].toArray();
  return {
    app: 'manabi-quest',
    format: 1,
    exportedAt: new Date().toISOString(),
    settings: s,
    profile: profile.get(),
    aiUsage: aiUsage.get(),
    tables,
  };
}

export async function importAll(data: Awaited<ReturnType<typeof exportAll>>) {
  if (data?.app !== 'manabi-quest') throw new Error('まなびクエストのバックアップファイルではありません');
  const keepKeys = settings.get().ai.providers;
  await db.transaction('rw', TABLES.map((t) => (db as unknown as Record<string, never>)[t]), async () => {
    for (const t of TABLES) {
      const table = (db as unknown as Record<string, { clear(): Promise<void>; bulkPut(x: unknown[]): Promise<unknown> }>)[t];
      await table.clear();
      if (data.tables[t]?.length) await table.bulkPut(data.tables[t]);
    }
  });
  // APIキーがバックアップに入っていなければ、今のキーを残す
  const s = data.settings;
  s.ai.providers = s.ai.providers.map((p) => (p.apiKey ? p : { ...p, apiKey: keepKeys.find((k) => k.id === p.id)?.apiKey ?? '' }));
  settings.replace(s);
  profile.replace(data.profile);
  aiUsage.replace(data.aiUsage);
  await reloadRegistry();
}

export async function resetAll() {
  await db.delete();
  localStorage.removeItem(profile.key);
  localStorage.removeItem(aiUsage.key);
  location.reload();
}
