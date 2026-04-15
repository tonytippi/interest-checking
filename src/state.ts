import { promises as fs } from 'fs';
import path from 'path';
import { StateSnapshot } from './types';

const EMPTY_STATE: StateSnapshot = {
  updatedAt: new Date(0).toISOString(),
  rates: {},
};

export async function loadState(filePath: string): Promise<StateSnapshot> {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(content) as StateSnapshot;
    if (!parsed || typeof parsed !== 'object' || !parsed.rates) {
      return EMPTY_STATE;
    }
    return parsed;
  } catch {
    return EMPTY_STATE;
  }
}

export async function saveState(filePath: string, state: StateSnapshot): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(state, null, 2), 'utf8');
}
