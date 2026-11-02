/**
 * The light build of hls.js (`hls.js/light`) ships without its own typings; its API is
 * the full build's, minus features this app does not use.
 */
declare module 'hls.js/light' {
  export * from 'hls.js';
  export { default } from 'hls.js';
}
