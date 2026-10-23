import { ImgHTMLAttributes, useEffect, useState } from "react";

// Uploaded images are served from /media/... and are saved for a long time by browsers and by the
// hosting network. If a bad copy of an image was ever saved (for example while the image storage was
// misconfigured), it would keep showing as broken after the storage is fixed.
//
// So uploaded images are requested with a version number, and bumping it makes every saved copy be
// skipped. If an image still fails to load, it is retried once with a unique address that no saved
// copy can match. Images from other sites (TMDB, Tubi) are left alone.
export const MEDIA_VERSION = "2";

const isMedia = (src?: string): src is string => Boolean(src && src.startsWith("/media/") && !src.includes("?"));

export function mediaUrl(src: string | undefined, retry = false): string | undefined {
  if (!isMedia(src)) return src;
  return retry ? `${src}?v=${MEDIA_VERSION}&r=${Date.now().toString(36)}` : `${src}?v=${MEDIA_VERSION}`;
}

export default function SafeImg({ src, onError, ...rest }: ImgHTMLAttributes<HTMLImageElement>) {
  const [retried, setRetried] = useState(false);
  useEffect(() => setRetried(false), [src]);

  return (
    <img
      {...rest}
      // The retry address is made once per failure, not on every render.
      src={retried ? retryUrl(src) : mediaUrl(src)}
      onError={(e) => {
        if (isMedia(src) && !retried) setRetried(true);
        onError?.(e);
      }}
    />
  );
}

const retryCache = new Map<string, string>();
function retryUrl(src: string | undefined) {
  if (!isMedia(src)) return src;
  if (!retryCache.has(src)) retryCache.set(src, mediaUrl(src, true)!);
  return retryCache.get(src);
}
