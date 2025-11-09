export function splitAddressAndPlaceId(input: string): { text: string; placeId?: string } {
  if (!input) return { text: '' };
  const parts = input.split('|');
  const text = parts[0].trim();
  const placeId = parts.length === 2 ? parts[1].trim() : undefined;
  return { text, placeId };
}

export function stripPlaceId(input: string): string {
  return splitAddressAndPlaceId(input).text;
}