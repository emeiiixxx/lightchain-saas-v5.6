export const fusionAspectRatios = ['auto', '1:1', '2:3', '3:2', '4:3', '3:4', '4:5', '5:4', '9:16', '16:9'] as const;

function positiveInteger(value: string): number | null {
  const text = value.trim();
  if (!/^\d+$/.test(text)) return null;
  const number = Number(text);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

export function parseFusionCustomRatio(width: string, height: string): string | null {
  const w = positiveInteger(width), h = positiveInteger(height);
  return w !== null && h !== null ? `${w}:${h}` : null;
}

export function isValidFusionCustomRatio(value: string): boolean {
  const parts = value.split(':');
  return parts.length === 2 && parseFusionCustomRatio(parts[0], parts[1]) !== null;
}
