// @ts-check
/**
 * WP-07: wait for the GPU without blocking the page.
 *
 * A WebGL call that needs a result (a shader's link status, a pixel readback) makes the page
 * wait until the GPU has run everything queued before it. On a software renderer (SwiftShader,
 * llvmpipe) that is seconds at startup, and the whole page freezes: timers, the toast, the
 * count animation. Instead, queue the work, drop a fence after it and check the fence once per
 * slice (`next`): checking never blocks, and once the fence has passed, the call that needs the
 * result returns at once.
 *
 * WebGL 1 has no fences: it resolves straight away (the next call then blocks, as before).
 */

/**
 * @param {WebGLRenderingContext | WebGL2RenderingContext} gl
 * @param {() => Promise<unknown>} next  resolves at the next slice (a frame)
 * @param {number} [maxSlices]  give up waiting after this many slices (the blocking call then just waits)
 * @returns {Promise<number>} slices waited
 */
export async function gpuDone(gl, next, maxSlices = 600) {
  if (typeof WebGL2RenderingContext === 'undefined' || !(gl instanceof WebGL2RenderingContext)) return 0;
  const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
  if (!sync) return 0;
  gl.flush();
  let n = 0;
  try {
    while (n < maxSlices) {
      await next(); n++;
      if (gl.getSyncParameter(sync, gl.SYNC_STATUS) === gl.SIGNALED) break;
    }
  } finally {
    gl.deleteSync(sync);
  }
  return n;
}
