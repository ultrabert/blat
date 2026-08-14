/** Painted soldier kits — parts live in /assets/skins/ */

export type SkinId = 'olive' | 'desert' | 'urban' | 'crimson' | 'navy';

export type SkinDef = {
  id: SkinId;
  label: string;
  /** Fallback limb tint if textures fail to load. */
  tint: number;
};

export const SKINS: Record<SkinId, SkinDef> = {
  olive: { id: 'olive', label: 'Scout', tint: 0x6b8f4e },
  desert: { id: 'desert', label: 'Desert', tint: 0xc4a574 },
  urban: { id: 'urban', label: 'Urban', tint: 0x6b7280 },
  crimson: { id: 'crimson', label: 'Raider', tint: 0xa34444 },
  navy: { id: 'navy', label: 'Marine', tint: 0x4a6d8c },
};

export const SKIN_IDS = Object.keys(SKINS) as SkinId[];

export const DEFAULT_SKIN: SkinId = 'olive';
export const BOT_SKIN: SkinId = 'crimson';

const MULTIPLAYER_POOL: SkinId[] = ['desert', 'urban', 'navy', 'olive'];

/** Stable skin pick from a session id string. */
export function skinForId(id: string, isBot: boolean, isLocal: boolean): SkinId {
  if (isLocal) return DEFAULT_SKIN;
  if (isBot) return BOT_SKIN;
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return MULTIPLAYER_POOL[h % MULTIPLAYER_POOL.length]!;
}

export function skinPartKeys(id: SkinId): {
  head: string;
  torso: string;
  arm: string;
  leg: string;
} {
  return {
    head: `skin_${id}_head`,
    torso: `skin_${id}_torso`,
    arm: `skin_${id}_arm`,
    leg: `skin_${id}_leg`,
  };
}

export const ALL_SKIN_PART_FILES: string[] = SKIN_IDS.flatMap((id) => [
  `skin_${id}_head`,
  `skin_${id}_torso`,
  `skin_${id}_arm`,
  `skin_${id}_leg`,
]);
