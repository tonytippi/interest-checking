import { RateRecord } from '../types';

interface EchelonAsset {
  symbol?: string;
  supplyApr?: number;
  borrowApr?: number;
}

interface EchelonResponse {
  data?: {
    assets?: EchelonAsset[];
  };
}

const ECHELON_URL = 'https://app.echelon.market/api/markets?network=aptos_mainnet';

export async function fetchEchelonRates(tokens: string[]): Promise<RateRecord[]> {
  const response = await fetch(ECHELON_URL);
  if (!response.ok) {
    throw new Error(`Echelon request failed with status ${response.status}`);
  }

  const payload = (await response.json()) as EchelonResponse;
  const assets = payload.data?.assets ?? [];

  const assetsBySymbol = new Map<string, EchelonAsset>();
  for (const asset of assets) {
    if (!asset.symbol) continue;
    assetsBySymbol.set(asset.symbol.toUpperCase(), asset);
  }

  return tokens.map(token => {
    const asset = assetsBySymbol.get(token);
    return {
      market: 'echelon',
      token,
      supplyApr: typeof asset?.supplyApr === 'number' ? asset.supplyApr : null,
      borrowApr: typeof asset?.borrowApr === 'number' ? asset.borrowApr : null,
      sourceId: asset?.symbol,
    };
  });
}
