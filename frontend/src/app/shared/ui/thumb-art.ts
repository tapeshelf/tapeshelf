/**
 * Make-believe video thumbnails painted with CSS gradients in the brand palette, for the landing
 * scene and the auth poster: no images to load, the same in both themes.
 */
export const THUMB_ART = {
  sunset:
    'radial-gradient(circle at 62% 64%, #f4f3ee 0 13%, transparent 13.5%), ' +
    'linear-gradient(170deg, transparent 0 66%, #171717 66.5%), ' +
    'linear-gradient(#fc753e, #f6b48c 70%, #f4f3ee)',
  bars: 'linear-gradient(90deg, #f4f3ee 0 14.3%, #d1e4db 0 28.6%, #fc753e 0 42.9%, #a9c9bb 0 57.2%, #ee6128 0 71.5%, #171717 0 85.8%, #ebeae3 0)',
  waves:
    'radial-gradient(120% 60% at 50% 120%, #171717 0 30%, transparent 30.5%), ' +
    'repeating-radial-gradient(circle at 30% 140%, #d1e4db 0 9px, #a9c9bb 9px 16px)',
  city:
    'radial-gradient(circle at 78% 26%, #f4f3ee 0 7%, transparent 7.5%), ' +
    'linear-gradient(90deg, transparent 0 8%, #252929 0 20%, transparent 0 26%, #313636 0 40%, transparent 0 46%, #252929 0 62%, transparent 0 70%, #313636 0 88%, transparent 0) bottom / 100% 55% no-repeat, ' +
    'linear-gradient(#27403a, #131515)',
  hills:
    'linear-gradient(155deg, transparent 0 55%, #a9c9bb 55.5% 70%, transparent 70.5%), ' +
    'linear-gradient(205deg, transparent 0 58%, #171717 58.5%), ' +
    'linear-gradient(#f4f3ee, #d1e4db)',
  stripes: 'repeating-linear-gradient(-45deg, #fc753e 0 10px, #f4f3ee 10px 20px)',
  dusk:
    'radial-gradient(circle at 30% 70%, #fc753e 0 16%, transparent 16.5%), ' +
    'linear-gradient(#3d5a80, #5b3a5e 60%, #8a3b2c)',
  sea:
    'linear-gradient(transparent 0 58%, #1f3a5f 58.5%), ' +
    'radial-gradient(circle at 70% 40%, #f4f3ee 0 9%, transparent 9.5%), ' +
    'linear-gradient(#a9c9bb, #d1e4db)',
  grid:
    'linear-gradient(90deg, rgb(23 23 23 / 0.9) 2px, transparent 2px) 0 0 / 22% 100%, ' +
    'linear-gradient(rgb(23 23 23 / 0.9) 2px, transparent 2px) 0 0 / 100% 30%, ' +
    'linear-gradient(135deg, #ee6128, #fc753e)',
  moon:
    'radial-gradient(circle at 64% 38%, #ebeae3 0 15%, transparent 15.5%), ' +
    'radial-gradient(circle at 58% 34%, #1b1e1e 0 15%, transparent 15.5%), ' +
    'linear-gradient(#131515, #27403a)',
} as const;

export type ThumbArt = keyof typeof THUMB_ART;
