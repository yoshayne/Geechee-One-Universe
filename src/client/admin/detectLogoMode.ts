import { LogoMode } from "./api";

// Looks at an uploaded logo and guesses how to show it on the black site.
// A logo with a lot of dark pixels (black text on a transparent background) would disappear,
// so it is shown on a light tile. Light or colorful logos are shown as uploaded.
export function detectLogoMode(url: string): Promise<LogoMode> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const w = 96;
        const ratio = img.naturalWidth && img.naturalHeight ? img.naturalHeight / img.naturalWidth : 0.33;
        const h = Math.max(1, Math.round(w * ratio));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve("original");
        ctx.drawImage(img, 0, 0, w, h);
        const data = ctx.getImageData(0, 0, w, h).data;
        let solid = 0;
        let dark = 0;
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] < 128) continue; // see-through pixels don't count
          solid++;
          const brightness = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
          if (brightness < 0.25) dark++;
        }
        resolve(solid > 0 && dark / solid > 0.2 ? "light" : "original");
      } catch {
        resolve("original");
      }
    };
    img.onerror = () => resolve("original");
    img.src = url;
  });
}
