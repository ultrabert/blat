/** Browser audio containers we ship. iOS Safari cannot decode Ogg Vorbis. */
export const SFX_FORMATS = [
  { ext: 'm4a', mime: 'audio/mp4; codecs="mp4a.40.2"' },
  { ext: 'ogg', mime: 'audio/ogg; codecs=vorbis' },
] as const;

/** Playable first (Safari → m4a, Firefox → ogg), then the rest as decode fallbacks. */
export function rankSfxExts(canPlayType: (mime: string) => string): string[] {
  const playable = SFX_FORMATS.filter((f) => canPlayType(f.mime) !== '').map((f) => f.ext);
  const rest = SFX_FORMATS.map((f) => f.ext).filter((ext) => !playable.includes(ext));
  return [...playable, ...rest];
}
