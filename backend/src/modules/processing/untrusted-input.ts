/**
 * What ffmpeg and ffprobe may do with a file someone uploaded. By itself ffmpeg follows what a file
 * says: an HLS playlist or a concat list named like a video makes it open other files on this
 * machine, among them other people's videos being processed. Only real media containers are read,
 * and only from local files or pipes. Goes before each `-i` of an uploaded file.
 */
const MEDIA_CONTAINERS = [
  'mov,mp4,m4a,3gp,3g2,mj2',
  'matroska,webm',
  'avi',
  'asf',
  'flv',
  'mpegts',
  'mpeg',
  'mpegvideo',
  'ogg',
  'mxf',
  'dv',
  'rm',
  'wav',
  'mp3',
  'aac',
  'flac',
].join(',');

export const UNTRUSTED_INPUT = [
  '-protocol_whitelist',
  'file,pipe',
  '-format_whitelist',
  MEDIA_CONTAINERS,
];

/**
 * The environment of ffmpeg and ffprobe: what they need to run, and none of the app's secrets. They
 * read untrusted files, so a bug in a decoder must find nothing worth taking.
 */
export const TOOL_ENV = {
  extendEnv: false,
  env: Object.fromEntries(
    [
      'PATH',
      'HOME',
      'LANG',
      'LC_ALL',
      'TMPDIR',
      'FONTCONFIG_PATH',
      'FONTCONFIG_FILE',
    ]
      .filter((name) => process.env[name] !== undefined)
      .map((name) => [name, process.env[name]!]),
  ),
} as const;
