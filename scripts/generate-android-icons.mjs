import sharp from 'sharp';
import path from 'path';

const SOURCE_IMAGE = 'public/images/logos/icont Logo.png';

// Android adaptive icon: canvas is 108dp. Safe zone is inner 66dp (~61% diameter).
// For 108dp canvas, a logo width of ~48dp (ratio ~44%) gives 24dp padding on each side,
// fitting strictly inside the 66dp circular mask with no clipping on any launcher.
const DENSITIES = {
  mdpi: { fg: 108, logoW: 50, icon: 48, iconLogoW: 34, roundLogoW: 30 },
  hdpi: { fg: 162, logoW: 75, icon: 72, iconLogoW: 51, roundLogoW: 45 },
  xhdpi: { fg: 216, logoW: 100, icon: 96, iconLogoW: 68, roundLogoW: 60 },
  xxhdpi: { fg: 324, logoW: 150, icon: 144, iconLogoW: 102, roundLogoW: 90 },
  xxxhdpi: { fg: 432, logoW: 200, icon: 192, iconLogoW: 136, roundLogoW: 120 },
};

async function generate() {
  const logoMeta = await sharp(SOURCE_IMAGE).metadata();
  const ratio = logoMeta.height / logoMeta.width;

  for (const [density, cfg] of Object.entries(DENSITIES)) {
    const dir = path.join('android', 'app', 'src', 'main', 'res', `mipmap-${density}`);

    // 1. ic_launcher_foreground.png
    // Canvas: cfg.fg x cfg.fg with transparent background.
    // Logo centered with comfortable padding to fit safely inside 66dp safe zone circle.
    const fgLogoH = Math.round(cfg.logoW * ratio);
    const fgLogoBuf = await sharp(SOURCE_IMAGE)
      .resize(cfg.logoW, fgLogoH, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .toBuffer();

    const fgLeft = Math.round((cfg.fg - cfg.logoW) / 2);
    const fgTop = Math.round((cfg.fg - fgLogoH) / 2);

    await sharp({
      create: {
        width: cfg.fg,
        height: cfg.fg,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      }
    })
      .composite([{ input: fgLogoBuf, left: fgLeft, top: fgTop }])
      .png()
      .toFile(path.join(dir, 'ic_launcher_foreground.png'));

    // 2. ic_launcher.png (Legacy: white squircle/rounded rectangle + centered logo)
    const iconLogoH = Math.round(cfg.iconLogoW * ratio);
    const iconLogoBuf = await sharp(SOURCE_IMAGE)
      .resize(cfg.iconLogoW, iconLogoH, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .toBuffer();

    const iconRadius = Math.round(cfg.icon * 0.20);
    const rectSvg = Buffer.from(
      `<svg width="${cfg.icon}" height="${cfg.icon}"><rect x="0" y="0" width="${cfg.icon}" height="${cfg.icon}" rx="${iconRadius}" ry="${iconRadius}" fill="#ffffff"/></svg>`
    );

    const iLeft = Math.round((cfg.icon - cfg.iconLogoW) / 2);
    const iTop = Math.round((cfg.icon - iconLogoH) / 2);

    await sharp(rectSvg)
      .composite([{ input: iconLogoBuf, left: iLeft, top: iTop }])
      .png()
      .toFile(path.join(dir, 'ic_launcher.png'));

    // 3. ic_launcher_round.png (Legacy: white circle + centered logo)
    const roundLogoH = Math.round(cfg.roundLogoW * ratio);
    const roundLogoBuf = await sharp(SOURCE_IMAGE)
      .resize(cfg.roundLogoW, roundLogoH, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .toBuffer();

    const circleSvg = Buffer.from(
      `<svg width="${cfg.icon}" height="${cfg.icon}"><circle cx="${cfg.icon/2}" cy="${cfg.icon/2}" r="${cfg.icon/2}" fill="#ffffff"/></svg>`
    );

    const rLeft = Math.round((cfg.icon - cfg.roundLogoW) / 2);
    const rTop = Math.round((cfg.icon - roundLogoH) / 2);

    await sharp(circleSvg)
      .composite([{ input: roundLogoBuf, left: rLeft, top: rTop }])
      .png()
      .toFile(path.join(dir, 'ic_launcher_round.png'));

    console.log(`Generated mipmap-${density}`);
  }
}

generate()
  .then(() => console.log('Successfully generated all icons!'))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
