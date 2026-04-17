import { promises as fs } from 'fs';
import path from 'path';
import { CarryStateSnapshot } from './types';

const EMPTY_CARRY_STATE: CarryStateSnapshot = {
  updatedAt: new Date(0).toISOString(),
  tokens: {},
};

export async function loadCarryState(filePath: string): Promise<CarryStateSnapshot> {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(content) as CarryStateSnapshot;
    if (!parsed || typeof parsed !== 'object' || !parsed.tokens) {
      return EMPTY_CARRY_STATE;
    }
    return parsed;
  } catch {
    return EMPTY_CARRY_STATE;
  }
}

export async function saveCarryState(filePath: string, state: CarryStateSnapshot): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(state, null, 2), 'utf8');
}
