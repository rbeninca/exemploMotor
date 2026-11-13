import * as THREE from 'three';

function configureColorTexture(
  canvas: HTMLCanvasElement,
  maxAnisotropy: number,
  repeatX = 1,
  repeatY = 1
): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = maxAnisotropy;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.needsUpdate = true;
  return texture;
}

/**
 * Laminated silicon-steel core texture showing stacked thin insulated sheets
 */
export function createLaminationTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#55606e';
  ctx.fillRect(0, 0, 512, 512);

  // Horizontal lamination stripes representing stacked steel sheets along Z
  for (let y = 0; y < 512; y += 6) {
    const shade = 78 + ((y * 17) % 22);
    ctx.fillStyle = `rgb(${shade}, ${shade + 8}, ${shade + 16})`;
    ctx.fillRect(0, y, 512, 4);
    ctx.fillStyle = '#2d3540';
    ctx.fillRect(0, y + 4, 512, 2);
  }

  // Subtle brushed metal micro-grain
  ctx.fillStyle = 'rgba(255,255,255,0.04)';
  for (let i = 0; i < 600; i++) {
    const x = (i * 73) % 512;
    const y = (i * 41) % 512;
    ctx.fillRect(x, y, 18, 1);
  }

  return configureColorTexture(canvas, maxAnisotropy, 1, 2);
}

/**
 * Brushed commutator copper texture with subtle circumferential wear track
 */
export function createBrushedCopperTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, '#c8733b');
  grad.addColorStop(0.25, '#da864d');
  grad.addColorStop(0.5, '#b6622f');
  grad.addColorStop(0.75, '#da864d');
  grad.addColorStop(1, '#c8733b');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 512);

  // Circumferential wear grooves from carbon brush friction
  for (let y = 0; y < 512; y += 3) {
    const alpha = y > 130 && y < 380 ? 0.14 : 0.06;
    ctx.fillStyle = y % 6 === 0 ? `rgba(40,18,8,${alpha})` : `rgba(255,220,185,${alpha * 0.7})`;
    ctx.fillRect(0, y, 512, 1.5);
  }

  return configureColorTexture(canvas, maxAnisotropy, 1, 1);
}

/**
 * Sintered carbon-graphite brush texture
 */
export function createGraphiteTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#24272d';
  ctx.fillRect(0, 0, 256, 256);

  // Fine sintered carbon-copper speckles
  for (let i = 0; i < 2400; i++) {
    const x = (i * 193) % 256;
    const y = (i * 127) % 256;
    const isCopperFleck = i % 19 === 0;
    ctx.fillStyle = isCopperFleck
      ? 'rgba(195, 128, 76, 0.25)'
      : i % 2 === 0
      ? 'rgba(255,255,255,0.06)'
      : 'rgba(0,0,0,0.22)';
    ctx.fillRect(x, y, 2, 2);
  }

  return configureColorTexture(canvas, maxAnisotropy, 1, 1);
}

/**
 * Technical laboratory baseplate surface texture with subtle metric grid markings
 */
export function createBaseplateTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#e5eaf0';
  ctx.fillRect(0, 0, 512, 512);

  // Fine machined grain
  ctx.fillStyle = 'rgba(15, 23, 42, 0.025)';
  for (let y = 0; y < 512; y += 4) {
    ctx.fillRect(0, y, 512, 1);
  }

  // Subtle technical grid
  ctx.strokeStyle = 'rgba(100, 116, 139, 0.14)';
  ctx.lineWidth = 1;
  for (let p = 0; p <= 512; p += 64) {
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, 512);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, p);
    ctx.lineTo(512, p);
    ctx.stroke();
  }

  return configureColorTexture(canvas, maxAnisotropy, 2, 2);
}

/**
 * Crisp N / S pole badge decal texture
 */
export function createPoleLabelTexture(
  letter: 'N' | 'S',
  bgColor: string,
  maxAnisotropy: number
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, 256, 256);

  // Subtle inner metallic rim
  ctx.strokeStyle = 'rgba(255,255,255,0.28)';
  ctx.lineWidth = 10;
  ctx.strokeRect(14, 14, 228, 228);

  ctx.fillStyle = '#ffffff';
  ctx.font = '700 138px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(letter, 128, 134);

  return configureColorTexture(canvas, maxAnisotropy, 1, 1);
}

/**
 * Soft radial contact shadow beneath the motor pedestal
 */
export function createContactShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createRadialGradient(256, 256, 30, 256, 256, 250);
  grad.addColorStop(0, 'rgba(15, 23, 42, 0.34)');
  grad.addColorStop(0.55, 'rgba(15, 23, 42, 0.14)');
  grad.addColorStop(1, 'rgba(15, 23, 42, 0)');

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 512);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Crisp terminal identifier plaque (N, F1, F2, R, S, T)
 */
export function createTerminalLabelTexture(
  text: string,
  bgColor: string,
  textColor: string,
  maxAnisotropy: number
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, 256, 128);

  ctx.strokeStyle = 'rgba(15, 23, 42, 0.25)';
  ctx.lineWidth = 6;
  ctx.strokeRect(4, 4, 248, 120);

  ctx.fillStyle = textColor;
  ctx.font = '700 68px "IBM Plex Mono", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 66);

  return configureColorTexture(canvas, maxAnisotropy, 1, 1);
}
