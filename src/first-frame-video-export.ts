import { BlobSource, BufferTarget, Conversion, Input, MP4, Mp4OutputFormat, Output, VideoSample } from 'mediabunny';

type Size = { width: number; height: number };

// Prefer even, square-pixel dimensions with the exact ratio. If the ratio
// cannot fit that way, use display metadata for the subpixel rounding.
function outputSize(frame: Size, maxEdge: number): Size {
  let a = frame.width, b = frame.height;
  while (b) [a, b] = [b, a % b];
  const unitWidth = frame.width / a, unitHeight = frame.height / a;
  const scale = 2 * Math.floor(maxEdge / (2 * Math.max(unitWidth, unitHeight)));
  if (scale >= 2) return { width: unitWidth * scale, height: unitHeight * scale };
  const factor = maxEdge / Math.max(frame.width, frame.height);
  const even = (value: number) => Math.max(2, 2 * Math.round(value * factor / 2));
  return { width: even(frame.width), height: even(frame.height) };
}

export async function exportFirstFrameVideo(clip: Blob, frame: Size, maxEdge: number, signal: AbortSignal): Promise<Blob> {
  signal.throwIfAborted();
  const size = outputSize(frame, maxEdge);
  const input = new Input({ formats: [MP4], source: new BlobSource(clip) });
  const output = new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() });
  try {
    const conversion = await Conversion.init({
      input, output,
      video: {
        ...size, fit: 'contain', codec: 'avc',
        ...(size.width * frame.height !== size.height * frame.width && {
          process(sample: VideoSample) {
            const source = sample.toVideoFrame();
            try {
              return new VideoSample(new VideoFrame(source, { displayWidth: frame.width, displayHeight: frame.height }));
            } finally { source.close(); }
          },
        }),
      },
    });
    if (signal.aborted || !conversion.isValid || conversion.discardedTracks.length) {
      await conversion.cancel();
      signal.throwIfAborted();
      throw new Error('video_export_unavailable');
    }
    const cancel = () => { void conversion.cancel().catch(() => {}); };
    signal.addEventListener('abort', cancel, { once: true });
    try {
      signal.throwIfAborted();
      await conversion.execute();
      signal.throwIfAborted();
      if (!output.target.buffer) throw new Error('video_export_empty');
      return new Blob([output.target.buffer], { type: 'video/mp4' });
    } finally { signal.removeEventListener('abort', cancel); }
  } finally { input.dispose(); }
}
