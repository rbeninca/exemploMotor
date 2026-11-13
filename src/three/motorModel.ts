import * as THREE from 'three';
import { MotorPartId, PhaseMode } from '../data/motorParts';
import {
  createBaseplateTexture,
  createBrushedCopperTexture,
  createContactShadowTexture,
  createGraphiteTexture,
  createLaminationTexture,
  createPoleLabelTexture,
  createTerminalLabelTexture,
} from './textures';

export interface MotorLiveTelemetry {
  angleDeg: number;
  rpm: number;
  acPhaseRad: number;
  phaseMode: PhaseMode;
  v1Volts: number;
  v2Volts: number;
  v3Volts: number;
  i1Amps: number;
  iNorm: number;
  neutralVolts: number; // Always 0.0 V reference
  fieldAngleDeg: number;
  leftPole: 'N' | 'S' | 'Neutro';
  rightPole: 'N' | 'S' | 'Neutro';
  isCommutating: boolean;
  activeSegmentAtPositiveBrush: string;
  torqueNormalized: number;
  commutatorBarsCount: number;
}

export interface MotorVisualOptions {
  voltageRms: number; // 0..220 V
  phaseLagDeg: number; // 0..45 deg
  phaseMode: PhaseMode;
  coilCount: number; // 1..24 coils
  fieldDirection: 1 | -1;
  explode: number; // 0..1
  showCurrent: boolean;
  showVectors: boolean;
  selectedPart: MotorPartId | null;
  hoveredPart: MotorPartId | null;
}

export interface MotorAssembly {
  root: THREE.Group;
  partHitTargets: Map<THREE.Object3D, MotorPartId>;
  partAnchors: Record<MotorPartId, THREE.Object3D>;
  update: (
    dt: number,
    rotorAngle: number,
    acPhaseRad: number,
    opts: MotorVisualOptions
  ) => MotorLiveTelemetry;
  dispose: () => void;
}

// Pre-allocated scratch math helpers (zero GC in render loop)
const _vec3A = new THREE.Vector3();
const _vec3B = new THREE.Vector3();
const _quatA = new THREE.Quaternion();
const _eulerA = new THREE.Euler();
const _mat4 = new THREE.Matrix4();
const _scale = new THREE.Vector3();
const _colorTarget = new THREE.Color();

const MAX_COILS = 24;
const MAX_BARS = MAX_COILS * 2;
const MAX_FORCE_ARROWS = 96;
const MAX_COIL_PARTICLES = 144;

function tagPart(
  obj: THREE.Object3D,
  partId: MotorPartId,
  hitMap: Map<THREE.Object3D, MotorPartId>
) {
  obj.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      child.userData.partId = partId;
      hitMap.set(child, partId);
    }
  });
}

function createCommutatorSegmentGeometry(
  innerR: number,
  outerR: number,
  length: number,
  startAngle: number,
  endAngle: number
): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  shape.absarc(0, 0, outerR, startAngle, endAngle, false);
  shape.lineTo(Math.cos(endAngle) * innerR, Math.sin(endAngle) * innerR);
  shape.absarc(0, 0, innerR, endAngle, startAngle, true);
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: length,
    bevelEnabled: true,
    bevelThickness: 0.012,
    bevelSize: 0.008,
    bevelSegments: 2,
    curveSegments: 28,
  });
  geo.translate(0, 0, -length * 0.5);
  return geo;
}

function createPoleShoeGeometry(
  innerR: number,
  outerR: number,
  length: number,
  arcHalfAngle: number
): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  shape.absarc(0, 0, outerR, -arcHalfAngle, arcHalfAngle, false);
  shape.lineTo(Math.cos(arcHalfAngle) * innerR, Math.sin(arcHalfAngle) * innerR);
  shape.absarc(0, 0, innerR, arcHalfAngle, -arcHalfAngle, true);
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: length,
    bevelEnabled: true,
    bevelThickness: 0.02,
    bevelSize: 0.018,
    bevelSegments: 2,
    curveSegments: 28,
  });
  geo.translate(0, 0, -length * 0.5);
  return geo;
}

function createRingYokeGeometry(
  innerR: number,
  outerR: number,
  length: number
): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  shape.absarc(0, 0, outerR, 0, Math.PI * 2, false);
  const hole = new THREE.Path();
  hole.absarc(0, 0, innerR, 0, Math.PI * 2, true);
  shape.holes.push(hole);

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: length,
    bevelEnabled: true,
    bevelThickness: 0.02,
    bevelSize: 0.02,
    bevelSegments: 2,
    curveSegments: 48,
  });
  geo.translate(0, 0, -length * 0.5);
  return geo;
}

function createArmatureCoreGeometry(radius: number, length: number): THREE.ExtrudeGeometry {
  const neckHalfW = 0.24;
  const tipHalfAngle = 0.62;
  const slotFloorR = 0.44;
  const shape = new THREE.Shape();

  const topStart = Math.PI / 2 - tipHalfAngle;
  const topEnd = Math.PI / 2 + tipHalfAngle;
  const botStart = (3 * Math.PI) / 2 - tipHalfAngle;
  const botEnd = (3 * Math.PI) / 2 + tipHalfAngle;

  shape.absarc(0, 0, radius, topStart, topEnd, false);
  shape.lineTo(-neckHalfW, Math.sin(topEnd) * slotFloorR + 0.14);
  shape.lineTo(-neckHalfW, Math.sin(botStart) * slotFloorR - 0.14);
  shape.absarc(0, 0, radius, botStart, botEnd, false);
  shape.lineTo(neckHalfW, Math.sin(botEnd) * slotFloorR - 0.14);
  shape.lineTo(neckHalfW, Math.sin(topStart) * slotFloorR + 0.14);
  shape.closePath();

  const hole = new THREE.Path();
  hole.absarc(0, 0, 0.165, 0, Math.PI * 2, true);
  shape.holes.push(hole);

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: length,
    bevelEnabled: true,
    bevelThickness: 0.02,
    bevelSize: 0.015,
    bevelSegments: 2,
    curveSegments: 28,
  });
  geo.translate(0, 0, -length * 0.5);
  return geo;
}

function createSpringGeometry(
  coilRadius: number,
  length: number,
  turns: number,
  wireRadius: number
): THREE.TubeGeometry {
  const points: THREE.Vector3[] = [];
  const steps = turns * 18;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const angle = t * turns * Math.PI * 2;
    const x = t * length;
    const y = Math.cos(angle) * coilRadius;
    const z = Math.sin(angle) * coilRadius;
    points.push(new THREE.Vector3(x, y, z));
  }
  const curve = new THREE.CatmullRomCurve3(points);
  return new THREE.TubeGeometry(curve, steps, wireRadius, 8, false);
}

function createStatorLoopCurve(
  xPos: number,
  halfY: number,
  zMin: number,
  zMax: number
): THREE.CatmullRomCurve3 {
  const pts = [
    new THREE.Vector3(xPos, halfY, zMin + 0.16),
    new THREE.Vector3(xPos, halfY, zMax - 0.16),
    new THREE.Vector3(xPos, halfY * 0.55, zMax),
    new THREE.Vector3(xPos, -halfY * 0.55, zMax),
    new THREE.Vector3(xPos, -halfY, zMax - 0.16),
    new THREE.Vector3(xPos, -halfY, zMin + 0.16),
    new THREE.Vector3(xPos, -halfY * 0.55, zMin),
    new THREE.Vector3(xPos, halfY * 0.55, zMin),
  ];
  return new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.2);
}

function createDrumCoilCurve(rx: number, zFront: number, zBack: number): THREE.CatmullRomCurve3 {
  const pts = [
    new THREE.Vector3(-rx, 0, zFront - 0.15),
    new THREE.Vector3(-rx, 0, zBack + 0.15),
    new THREE.Vector3(-rx * 0.72, 0.14, zBack),
    new THREE.Vector3(0, 0.22, zBack - 0.05),
    new THREE.Vector3(rx * 0.72, 0.14, zBack),
    new THREE.Vector3(rx, 0, zBack + 0.15),
    new THREE.Vector3(rx, 0, zFront - 0.15),
    new THREE.Vector3(rx * 0.72, -0.14, zFront),
    new THREE.Vector3(0, -0.22, zFront + 0.05),
    new THREE.Vector3(-rx * 0.72, -0.14, zFront),
  ];
  return new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.22);
}

export function createMotorAssembly(maxAnisotropy: number, isSoftwareGl: boolean): MotorAssembly {
  const root = new THREE.Group();
  const partHitTargets = new Map<THREE.Object3D, MotorPartId>();

  const disposables: Array<{ dispose: () => void }> = [];
  const track = <T extends { dispose: () => void }>(item: T): T => {
    disposables.push(item);
    return item;
  };

  // Baseplate vertical floor at y = -1.85 so 2Φ & 3Φ cylindrical stators clear cleanly
  const BASE_TOP_Y = -1.85;

  // --- Procedural Textures ---
  const laminationTex = track(createLaminationTexture(maxAnisotropy));
  const copperTex = track(createBrushedCopperTexture(maxAnisotropy));
  const graphiteTex = track(createGraphiteTexture(maxAnisotropy));
  const baseplateTex = track(createBaseplateTexture(maxAnisotropy));
  const contactShadowTex = track(createContactShadowTexture());
  const northLabelTex = track(createPoleLabelTexture('N', '#c83e3b', maxAnisotropy));
  const southLabelTex = track(createPoleLabelTexture('S', '#2563eb', maxAnisotropy));

  // Terminal plaque textures
  const texN = track(createTerminalLabelTexture('N 0V', '#0284c7', '#ffffff', maxAnisotropy));
  const texF1 = track(createTerminalLabelTexture('F1', '#0f172a', '#38bdf8', maxAnisotropy));
  const texF2 = track(createTerminalLabelTexture('F2', '#0f172a', '#c084fc', maxAnisotropy));
  const texR = track(createTerminalLabelTexture('R', '#0f172a', '#38bdf8', maxAnisotropy));
  const texS = track(createTerminalLabelTexture('S', '#0f172a', '#34d399', maxAnisotropy));
  const texT = track(createTerminalLabelTexture('T', '#0f172a', '#fb7185', maxAnisotropy));
  const texNeutralZone = track(
    createTerminalLabelTexture('ZONA NEUTRA', '#e2e8f0', '#0f172a', maxAnisotropy)
  );

  // --- Calibrated PBR Materials ---
  const baseplateMat = track(
    new THREE.MeshStandardMaterial({
      map: baseplateTex,
      color: 0xf1f5f9,
      roughness: 0.62,
      metalness: 0.18,
    })
  );
  const castFrameMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.55,
      metalness: 0.45,
    })
  );
  const machinedSteelMat = track(
    new THREE.MeshPhysicalMaterial({
      color: 0xdbe3ec,
      roughness: 0.22,
      metalness: 0.92,
      clearcoat: 0.2,
    })
  );
  const laminationMat = track(
    new THREE.MeshStandardMaterial({
      map: laminationTex,
      color: 0x94a3b8,
      roughness: 0.48,
      metalness: 0.72,
    })
  );
  const enameledCopperMat = track(
    new THREE.MeshPhysicalMaterial({
      color: 0xd97236,
      roughness: 0.24,
      metalness: 0.88,
      clearcoat: 0.65,
      clearcoatRoughness: 0.16,
    })
  );
  const statorCopperMat = track(
    new THREE.MeshPhysicalMaterial({
      color: 0xd4672b,
      roughness: 0.25,
      metalness: 0.88,
      clearcoat: 0.6,
      clearcoatRoughness: 0.18,
    })
  );
  const commCopperMatA = track(
    new THREE.MeshPhysicalMaterial({
      map: copperTex,
      color: 0xe68b4e,
      roughness: 0.2,
      metalness: 0.92,
    })
  );
  const commCopperMatB = track(
    new THREE.MeshPhysicalMaterial({
      map: copperTex,
      color: 0xe68b4e,
      roughness: 0.2,
      metalness: 0.92,
    })
  );
  const multiCommMat = track(
    new THREE.MeshPhysicalMaterial({
      map: copperTex,
      color: 0xe68b4e,
      roughness: 0.22,
      metalness: 0.9,
    })
  );
  const micaMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.82,
      metalness: 0.05,
    })
  );
  const graphiteMat = track(
    new THREE.MeshStandardMaterial({
      map: graphiteTex,
      color: 0x2d3139,
      roughness: 0.86,
      metalness: 0.12,
    })
  );
  const brassMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xd4a64a,
      roughness: 0.28,
      metalness: 0.88,
    })
  );
  const springMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xc28a49,
      roughness: 0.25,
      metalness: 0.9,
    })
  );
  const insulatorMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x1e2430,
      roughness: 0.68,
      metalness: 0.08,
    })
  );
  const neutralBlueMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      roughness: 0.4,
      metalness: 0.25,
    })
  );
  const bronzeBearingMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xb58345,
      roughness: 0.3,
      metalness: 0.85,
    })
  );

  // Per-pole materials for 1Φ (2 poles), 2Φ (4 poles), 3Φ (6 poles) so each pole tints dynamically
  const createPoleMat = () =>
    track(
      new THREE.MeshStandardMaterial({
        map: laminationTex,
        color: 0x64748b,
        roughness: 0.45,
        metalness: 0.45,
      })
    );

  const poles1PhMats = [createPoleMat(), createPoleMat()];
  const poles2PhMats = [createPoleMat(), createPoleMat(), createPoleMat(), createPoleMat()];
  const poles3PhMats = Array.from({ length: 6 }, () => createPoleMat());

  const highlightRegistry: Array<{ partId: MotorPartId; mat: THREE.MeshStandardMaterial }> = [
    { partId: 'induzido', mat: laminationMat },
    { partId: 'bobinas', mat: enameledCopperMat },
    { partId: 'bobinas-estator', mat: statorCopperMat },
    { partId: 'comutador', mat: commCopperMatA },
    { partId: 'comutador', mat: commCopperMatB },
    { partId: 'comutador', mat: multiCommMat },
    { partId: 'escovas', mat: graphiteMat },
    { partId: 'porta-escovas', mat: brassMat },
    { partId: 'eixo', mat: machinedSteelMat },
    { partId: 'neutro', mat: neutralBlueMat },
    ...poles1PhMats.map((mat) => ({ partId: 'estator' as MotorPartId, mat })),
    ...poles2PhMats.map((mat) => ({ partId: 'estator' as MotorPartId, mat })),
    ...poles3PhMats.map((mat) => ({ partId: 'estator' as MotorPartId, mat })),
  ];

  // --- 1. Studio Ground Contact Shadow & Baseplate ---
  const shadowPlane = new THREE.Mesh(
    track(new THREE.PlaneGeometry(11, 11)),
    track(
      new THREE.MeshBasicMaterial({
        map: contactShadowTex,
        transparent: true,
        depthWrite: false,
        opacity: 0.72,
      })
    )
  );
  shadowPlane.rotation.x = -Math.PI / 2;
  shadowPlane.position.set(0, BASE_TOP_Y - 0.18, 0.25);
  root.add(shadowPlane);

  const baseGroup = new THREE.Group();
  const basePlate = new THREE.Mesh(
    track(new THREE.BoxGeometry(5.8, 0.16, 6.0)),
    baseplateMat
  );
  basePlate.position.set(0, BASE_TOP_Y - 0.08, 0.25);
  basePlate.receiveShadow = !isSoftwareGl;
  basePlate.castShadow = !isSoftwareGl;
  baseGroup.add(basePlate);

  const baseTrim = new THREE.Mesh(track(new THREE.BoxGeometry(5.92, 0.08, 6.12)), castFrameMat);
  baseTrim.position.set(0, BASE_TOP_Y - 0.13, 0.25);
  baseGroup.add(baseTrim);

  const boltGeo = track(new THREE.CylinderGeometry(0.065, 0.065, 0.06, 6));
  const boltInstanced = new THREE.InstancedMesh(boltGeo, machinedSteelMat, 8);
  const boltPositions: Array<[number, number, number]> = [
    [-2.6, BASE_TOP_Y + 0.02, -2.45],
    [2.6, BASE_TOP_Y + 0.02, -2.45],
    [-2.6, BASE_TOP_Y + 0.02, 2.95],
    [2.6, BASE_TOP_Y + 0.02, 2.95],
    [-2.35, BASE_TOP_Y + 0.02, -0.35],
    [2.35, BASE_TOP_Y + 0.02, -0.35],
    [-1.6, BASE_TOP_Y + 0.02, 1.45],
    [1.6, BASE_TOP_Y + 0.02, 1.45],
  ];
  boltPositions.forEach(([bx, by, bz], idx) => {
    _vec3A.set(bx, by, bz);
    _quatA.identity();
    _scale.set(1, 1, 1);
    _mat4.compose(_vec3A, _quatA, _scale);
    boltInstanced.setMatrixAt(idx, _mat4);
  });
  boltInstanced.instanceMatrix.needsUpdate = true;
  boltInstanced.computeBoundingSphere();
  baseGroup.add(boltInstanced);
  root.add(baseGroup);

  // --- 2. Bearing Pedestals (reaching cleanly down to BASE_TOP_Y) ---
  const bearingsGroup = new THREE.Group();
  const buildBearingPedestal = (zPos: number, isFront: boolean) => {
    const ped = new THREE.Group();
    ped.position.set(0, 0, zPos);

    const pillarHeight = Math.abs(BASE_TOP_Y) - 0.14;
    const pillar = new THREE.Mesh(
      track(new THREE.BoxGeometry(0.46, pillarHeight, 0.24)),
      castFrameMat
    );
    pillar.position.set(0, BASE_TOP_Y + pillarHeight * 0.5 + 0.06, 0);
    pillar.castShadow = !isSoftwareGl;
    ped.add(pillar);

    const foot = new THREE.Mesh(track(new THREE.BoxGeometry(0.95, 0.12, 0.42)), castFrameMat);
    foot.position.set(0, BASE_TOP_Y + 0.06, 0);
    ped.add(foot);

    const housingRing = new THREE.Mesh(
      track(new THREE.CylinderGeometry(0.34, 0.34, 0.26, 28)),
      castFrameMat
    );
    housingRing.rotation.x = Math.PI / 2;
    ped.add(housingRing);

    const bronzeRing = new THREE.Mesh(
      track(new THREE.CylinderGeometry(0.24, 0.24, 0.29, 28)),
      bronzeBearingMat
    );
    bronzeRing.rotation.x = Math.PI / 2;
    ped.add(bronzeRing);

    if (isFront) {
      housingRing.scale.set(0.92, 1, 0.92);
    }
    return ped;
  };
  bearingsGroup.add(buildBearingPedestal(-1.95, false));
  bearingsGroup.add(buildBearingPedestal(2.32, true));
  tagPart(bearingsGroup, 'eixo', partHitTargets);
  root.add(bearingsGroup);

  // --- 3. Neutral Terminal Block & Neutral Zone Indicator (neutro) ---
  const neutralGroup = new THREE.Group();
  const terminalBlock = new THREE.Mesh(
    track(new THREE.BoxGeometry(1.75, 0.2, 0.62)),
    insulatorMat
  );
  terminalBlock.position.set(-1.65, BASE_TOP_Y + 0.1, 2.48);
  terminalBlock.castShadow = !isSoftwareGl;
  neutralGroup.add(terminalBlock);

  // Neutral Binding Post (N - 0 V) always prominent
  const buildTerminalPost = (
    xPos: number,
    mat: THREE.Material,
    plaqueTex: THREE.CanvasTexture
  ) => {
    const grp = new THREE.Group();
    grp.position.set(xPos, BASE_TOP_Y + 0.2, 2.48);

    const post = new THREE.Mesh(
      track(new THREE.CylinderGeometry(0.085, 0.095, 0.18, 18)),
      mat
    );
    post.position.y = 0.09;
    const cap = new THREE.Mesh(
      track(new THREE.CylinderGeometry(0.065, 0.065, 0.06, 16)),
      brassMat
    );
    cap.position.y = 0.21;

    const plaque = new THREE.Mesh(
      track(new THREE.PlaneGeometry(0.36, 0.18)),
      track(new THREE.MeshBasicMaterial({ map: plaqueTex }))
    );
    plaque.position.set(0, -0.02, 0.32);
    plaque.rotation.x = -0.35;

    grp.add(post, cap, plaque);
    return grp;
  };

  const postN = buildTerminalPost(-2.22, neutralBlueMat, texN);
  const postP1A = buildTerminalPost(-1.82, castFrameMat, texF1);
  const postP2A = buildTerminalPost(-1.42, castFrameMat, texF2);
  const postR = buildTerminalPost(-1.82, castFrameMat, texR);
  const postS = buildTerminalPost(-1.42, castFrameMat, texS);
  const postT = buildTerminalPost(-1.02, castFrameMat, texT);

  neutralGroup.add(postN, postP1A, postP2A, postR, postS, postT);

  // Small N (0 V) plaque above the left brush terminal nut showing direct Neutral connection
  const leftBrushNeutralPlaque = new THREE.Mesh(
    track(new THREE.PlaneGeometry(0.34, 0.17)),
    track(new THREE.MeshBasicMaterial({ map: texN }))
  );
  leftBrushNeutralPlaque.position.set(-1.62, BASE_TOP_Y + 0.38, 2.02);
  leftBrushNeutralPlaque.rotation.x = -0.35;
  neutralGroup.add(leftBrushNeutralPlaque);

  // Direct Blue Neutral jumper bridging Left Brush Terminal (-1.62, 1.99) -> N (0 V) Post (-2.22, 2.48)
  const neutralBrushBridgeCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-1.62, BASE_TOP_Y + 0.22, 1.99),
    new THREE.Vector3(-1.9, BASE_TOP_Y + 0.3, 2.18),
    new THREE.Vector3(-2.14, BASE_TOP_Y + 0.28, 2.34),
    new THREE.Vector3(-2.22, BASE_TOP_Y + 0.25, 2.48),
  ]);
  neutralGroup.add(
    new THREE.Mesh(
      track(new THREE.TubeGeometry(neutralBrushBridgeCurve, 22, 0.024, 8, false)),
      neutralBlueMat
    )
  );

  // Neutral cable connecting N (0 V) terminal to stator common star/return bus
  const neutralBusCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-2.22, BASE_TOP_Y + 0.25, 2.46),
    new THREE.Vector3(-2.38, BASE_TOP_Y + 0.22, 1.45),
    new THREE.Vector3(-2.15, BASE_TOP_Y + 0.35, 0.55),
  ]);
  neutralGroup.add(
    new THREE.Mesh(
      track(new THREE.TubeGeometry(neutralBusCurve, 22, 0.024, 8, false)),
      neutralBlueMat
    )
  );

  // Phase jumper routing Right Brush Terminal (+1.62, 1.99) -> Phase Post F1/R (-1.82, 2.48)
  const phaseWireMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xdc2626,
      roughness: 0.42,
      metalness: 0.12,
    })
  );
  const phaseBrushBridgeCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(1.62, BASE_TOP_Y + 0.2, 1.99),
    new THREE.Vector3(1.42, BASE_TOP_Y + 0.06, 1.8),
    new THREE.Vector3(0.0, BASE_TOP_Y + 0.05, 1.78),
    new THREE.Vector3(-1.55, BASE_TOP_Y + 0.06, 1.8),
    new THREE.Vector3(-1.82, BASE_TOP_Y + 0.26, 2.16),
    new THREE.Vector3(-1.82, BASE_TOP_Y + 0.25, 2.48),
  ]);
  neutralGroup.add(
    new THREE.Mesh(
      track(new THREE.TubeGeometry(phaseBrushBridgeCurve, 44, 0.022, 8, false)),
      phaseWireMat
    )
  );

  // Vertical Magnetic Neutral Zone Indicator at Commutator (x = 0, z = 1.45)
  const neutralLineMat = track(
    new THREE.MeshBasicMaterial({
      color: 0x0284c7,
      transparent: true,
      opacity: 0.72,
    })
  );
  const neutralTickTop = new THREE.Mesh(
    track(new THREE.BoxGeometry(0.024, 0.26, 0.04)),
    neutralLineMat
  );
  neutralTickTop.position.set(0, 0.62, 1.45);
  const neutralTickBot = new THREE.Mesh(
    track(new THREE.BoxGeometry(0.024, 0.26, 0.04)),
    neutralLineMat
  );
  neutralTickBot.position.set(0, -0.62, 1.45);
  const neutralBadge = new THREE.Mesh(
    track(new THREE.PlaneGeometry(0.68, 0.22)),
    track(
      new THREE.MeshBasicMaterial({
        map: texNeutralZone,
        transparent: true,
        opacity: 0.92,
      })
    )
  );
  neutralBadge.position.set(0, -0.84, 1.45);
  neutralGroup.add(neutralTickTop, neutralTickBot, neutralBadge);

  tagPart(neutralGroup, 'neutro', partHitTargets);
  root.add(neutralGroup);

  // --- 4. Multi-Phase Stator Assemblies (1Φ 2-pole, 2Φ 4-pole, 3Φ 6-pole) ---
  const northBadgeMat = track(new THREE.MeshBasicMaterial({ map: northLabelTex }));
  const southBadgeMat = track(new THREE.MeshBasicMaterial({ map: southLabelTex }));

  interface DynamicPoleItem {
    northPlane: THREE.Mesh;
    southPlane: THREE.Mesh;
    mat: THREE.MeshStandardMaterial;
    coilCurves: THREE.CatmullRomCurve3[];
    particles: THREE.InstancedMesh;
    poleGroup: THREE.Group;
    coilGroup: THREE.Group;
    angleRad: number;
    phaseOffsetRad: number; // 0, -pi/2, -2pi/3, -4pi/3
    polaritySign: 1 | -1; // Opposite pole in pair has -1
  }

  // 4A. 1-Phase Stator (2 Poles at 180° and 0°)
  const stator1PhGroup = new THREE.Group();
  const poles1Ph: DynamicPoleItem[] = [];

  const build1PhPole = (side: -1 | 1, mat: THREE.MeshStandardMaterial) => {
    const wrapper = new THREE.Group();
    const coreGroup = new THREE.Group();
    coreGroup.position.set(0, 0, -0.35);

    const poleGeo = track(createPoleShoeGeometry(1.04, 1.38, 1.76, 0.86));
    const poleMesh = new THREE.Mesh(poleGeo, mat);
    if (side === -1) poleMesh.rotation.z = Math.PI;
    poleMesh.castShadow = !isSoftwareGl;
    poleMesh.receiveShadow = !isSoftwareGl;
    coreGroup.add(poleMesh);

    const coreNeck = new THREE.Mesh(track(new THREE.BoxGeometry(0.62, 0.86, 1.44)), mat);
    coreNeck.position.set(side * 1.62, 0, 0);
    coreNeck.castShadow = !isSoftwareGl;
    coreGroup.add(coreNeck);

    const outerYoke = new THREE.Mesh(track(new THREE.BoxGeometry(0.24, 1.42, 1.7)), castFrameMat);
    outerYoke.position.set(side * 2.02, -0.22, 0);
    outerYoke.castShadow = !isSoftwareGl;
    coreGroup.add(outerYoke);

    const legH = Math.abs(BASE_TOP_Y) - 0.85;
    const leg = new THREE.Mesh(track(new THREE.BoxGeometry(0.46, legH, 1.32)), castFrameMat);
    leg.position.set(side * 1.98, BASE_TOP_Y + legH * 0.5 + 0.06, 0);
    leg.castShadow = !isSoftwareGl;
    coreGroup.add(leg);

    const foot = new THREE.Mesh(track(new THREE.BoxGeometry(0.75, 0.12, 1.56)), castFrameMat);
    foot.position.set(side * 1.94, BASE_TOP_Y + 0.06, 0);
    coreGroup.add(foot);

    const badgeGeo = track(new THREE.PlaneGeometry(0.48, 0.48));
    const northPlane = new THREE.Mesh(badgeGeo, northBadgeMat);
    northPlane.position.set(side * 2.15, 0.08, 0);
    northPlane.rotation.y = side === -1 ? -Math.PI / 2 : Math.PI / 2;

    const southPlane = new THREE.Mesh(badgeGeo, southBadgeMat);
    southPlane.position.copy(northPlane.position);
    southPlane.rotation.copy(northPlane.rotation);

    coreGroup.add(northPlane, southPlane);
    tagPart(coreGroup, 'estator', partHitTargets);
    wrapper.add(coreGroup);

    const coilGroup = new THREE.Group();
    coilGroup.position.set(0, 0, -0.35);
    const bobbinIn = new THREE.Mesh(track(new THREE.BoxGeometry(0.06, 1.2, 1.7)), insulatorMat);
    bobbinIn.position.set(side * 1.34, 0, 0);
    const bobbinOut = new THREE.Mesh(track(new THREE.BoxGeometry(0.06, 1.2, 1.7)), insulatorMat);
    bobbinOut.position.set(side * 1.88, 0, 0);
    coilGroup.add(bobbinIn, bobbinOut);

    const coilCurves: THREE.CatmullRomCurve3[] = [];
    [1.44, 1.56, 1.68, 1.8].forEach((lx, idx) => {
      const halfY = 0.52 + (idx % 2) * 0.04;
      const zPad = 0.78 + (idx % 2) * 0.04;
      const curve = createStatorLoopCurve(side * lx, halfY, -zPad, zPad);
      coilCurves.push(curve);
      const tube = new THREE.Mesh(
        track(new THREE.TubeGeometry(curve, 64, 0.046, 10, true)),
        statorCopperMat
      );
      tube.castShadow = !isSoftwareGl;
      coilGroup.add(tube);
    });

    const pGeo = track(new THREE.SphereGeometry(0.035, 8, 8));
    const pMat = track(new THREE.MeshBasicMaterial({ color: 0xf59e0b }));
    const particles = new THREE.InstancedMesh(pGeo, pMat, 24);
    particles.frustumCulled = false;
    coilGroup.add(particles);

    tagPart(coilGroup, 'bobinas-estator', partHitTargets);
    wrapper.add(coilGroup);
    stator1PhGroup.add(wrapper);

    poles1Ph.push({
      northPlane,
      southPlane,
      mat,
      coilCurves,
      particles,
      poleGroup: wrapper,
      coilGroup,
      angleRad: side === -1 ? Math.PI : 0,
      phaseOffsetRad: 0,
      polaritySign: side === -1 ? 1 : -1,
    });
  };
  build1PhPole(-1, poles1PhMats[0]);
  build1PhPole(1, poles1PhMats[1]);
  root.add(stator1PhGroup);

  // Helper to build radial Multi-Phase Stator Rings (2Φ = 4 poles, 3Φ = 6 poles)
  const buildMultiPoleStator = (
    numPoles: number,
    mats: THREE.MeshStandardMaterial[],
    arcHalf: number,
    phaseAssignments: Array<{ phaseOffsetRad: number; polaritySign: 1 | -1 }>
  ): { group: THREE.Group; poles: DynamicPoleItem[] } => {
    const group = new THREE.Group();
    const poles: DynamicPoleItem[] = [];

    // Outer laminated stator yoke ring (r: 1.62 .. 1.80) sitting cleanly above BASE_TOP_Y = -1.85
    const yokeMesh = new THREE.Mesh(
      track(createRingYokeGeometry(1.62, 1.8, 1.7)),
      castFrameMat
    );
    yokeMesh.position.set(0, 0, -0.35);
    yokeMesh.castShadow = !isSoftwareGl;
    yokeMesh.receiveShadow = !isSoftwareGl;
    tagPart(yokeMesh, 'estator', partHitTargets);
    group.add(yokeMesh);

    // Sculpted stator cradle feet anchoring the ring cleanly to BASE_TOP_Y = -1.85
    const footLeft = new THREE.Mesh(track(new THREE.BoxGeometry(0.45, 0.55, 1.5)), castFrameMat);
    footLeft.position.set(-1.35, -1.56, -0.35);
    const footRight = new THREE.Mesh(track(new THREE.BoxGeometry(0.45, 0.55, 1.5)), castFrameMat);
    footRight.position.set(1.35, -1.56, -0.35);
    const footBase = new THREE.Mesh(track(new THREE.BoxGeometry(3.2, 0.14, 1.62)), castFrameMat);
    footBase.position.set(0, BASE_TOP_Y + 0.07, -0.35);
    tagPart(footLeft, 'estator', partHitTargets);
    tagPart(footRight, 'estator', partHitTargets);
    tagPart(footBase, 'estator', partHitTargets);
    group.add(footLeft, footRight, footBase);

    const poleGeo = track(createPoleShoeGeometry(1.03, 1.24, 1.68, arcHalf));
    const neckWidth = numPoles === 4 ? 0.54 : 0.42;
    const halfY = numPoles === 4 ? 0.34 : 0.27;
    const pGeo = track(new THREE.SphereGeometry(0.032, 8, 8));
    const pMat = track(new THREE.MeshBasicMaterial({ color: 0xf59e0b }));

    for (let i = 0; i < numPoles; i++) {
      const angleRad = (i * Math.PI * 2) / numPoles;
      const polePivot = new THREE.Group();
      polePivot.position.set(0, 0, -0.35);
      polePivot.rotation.z = angleRad;

      const poleCore = new THREE.Group();
      const shoe = new THREE.Mesh(poleGeo, mats[i]);
      shoe.castShadow = !isSoftwareGl;
      poleCore.add(shoe);

      const neck = new THREE.Mesh(
        track(new THREE.BoxGeometry(0.42, neckWidth, 1.46)),
        mats[i]
      );
      neck.position.set(1.43, 0, 0);
      poleCore.add(neck);

      // Front-facing N / S indicator badge on pole shoulder
      const bGeo = track(new THREE.PlaneGeometry(0.32, 0.32));
      const northPlane = new THREE.Mesh(bGeo, northBadgeMat);
      northPlane.position.set(1.44, 0, 0.87);
      northPlane.rotation.z = -angleRad; // keep letter upright!

      const southPlane = new THREE.Mesh(bGeo, southBadgeMat);
      southPlane.position.copy(northPlane.position);
      southPlane.rotation.copy(northPlane.rotation);

      poleCore.add(northPlane, southPlane);
      tagPart(poleCore, 'estator', partHitTargets);
      polePivot.add(poleCore);

      // Stator field coil around the radial pole neck
      const coilGroup = new THREE.Group();
      const bobIn = new THREE.Mesh(
        track(new THREE.BoxGeometry(0.045, halfY * 2 + 0.18, 1.66)),
        insulatorMat
      );
      bobIn.position.set(1.26, 0, 0);
      const bobOut = new THREE.Mesh(
        track(new THREE.BoxGeometry(0.045, halfY * 2 + 0.18, 1.66)),
        insulatorMat
      );
      bobOut.position.set(1.58, 0, 0);
      coilGroup.add(bobIn, bobOut);

      const coilCurves: THREE.CatmullRomCurve3[] = [];
      [1.36, 1.48].forEach((lx) => {
        const curve = createStatorLoopCurve(lx, halfY, -0.78, 0.78);
        coilCurves.push(curve);
        const tube = new THREE.Mesh(
          track(new THREE.TubeGeometry(curve, 48, 0.042, 8, true)),
          statorCopperMat
        );
        tube.castShadow = !isSoftwareGl;
        coilGroup.add(tube);
      });

      const particles = new THREE.InstancedMesh(pGeo, pMat, 16);
      particles.frustumCulled = false;
      coilGroup.add(particles);

      tagPart(coilGroup, 'bobinas-estator', partHitTargets);
      polePivot.add(coilGroup);

      group.add(polePivot);

      poles.push({
        northPlane,
        southPlane,
        mat: mats[i],
        coilCurves,
        particles,
        poleGroup: poleCore,
        coilGroup,
        angleRad,
        phaseOffsetRad: phaseAssignments[i].phaseOffsetRad,
        polaritySign: phaseAssignments[i].polaritySign,
      });
    }

    return { group, poles };
  };

  // 4B. 2-Phase Stator (4 poles: F1 at 180°/0°, F2 at 90°/270°)
  const stator2Ph = buildMultiPoleStator(4, poles2PhMats, 0.5, [
    { phaseOffsetRad: 0, polaritySign: -1 }, // +X (0°)
    { phaseOffsetRad: -Math.PI / 2, polaritySign: -1 }, // +Y (90°)
    { phaseOffsetRad: 0, polaritySign: 1 }, // -X (180°)
    { phaseOffsetRad: -Math.PI / 2, polaritySign: 1 }, // -Y (270°)
  ]);
  root.add(stator2Ph.group);

  // 4C. 3-Phase Stator (6 poles: R 0°/180°, S 120°/300°, T 240°/60°)
  const stator3Ph = buildMultiPoleStator(6, poles3PhMats, 0.34, [
    { phaseOffsetRad: 0, polaritySign: -1 }, // 0° (R-)
    { phaseOffsetRad: -(4 * Math.PI) / 3, polaritySign: 1 }, // 60° (T+)
    { phaseOffsetRad: -(2 * Math.PI) / 3, polaritySign: -1 }, // 120° (S-)
    { phaseOffsetRad: 0, polaritySign: 1 }, // 180° (R+)
    { phaseOffsetRad: -(4 * Math.PI) / 3, polaritySign: -1 }, // 240° (T-)
    { phaseOffsetRad: -(2 * Math.PI) / 3, polaritySign: 1 }, // 300° (S+)
  ]);
  root.add(stator3Ph.group);

  // --- 5. Rotor Assembly (Shaft + Adaptive Core + Adaptive Coils + Adaptive Commutator) ---
  const rotorGroup = new THREE.Group();
  root.add(rotorGroup);

  const shaftGroup = new THREE.Group();
  const shaftProfile = [
    new THREE.Vector2(0.0, -2.35),
    new THREE.Vector2(0.11, -2.35),
    new THREE.Vector2(0.14, -2.28),
    new THREE.Vector2(0.14, -1.3),
    new THREE.Vector2(0.175, -1.28),
    new THREE.Vector2(0.175, 0.72),
    new THREE.Vector2(0.14, 0.75),
    new THREE.Vector2(0.14, 2.95),
    new THREE.Vector2(0.09, 3.0),
    new THREE.Vector2(0.0, 3.0),
  ];
  const shaftGeo = track(new THREE.LatheGeometry(shaftProfile, 28));
  shaftGeo.rotateX(Math.PI / 2);
  const shaftMesh = new THREE.Mesh(shaftGeo, machinedSteelMat);
  shaftMesh.castShadow = !isSoftwareGl;
  shaftGroup.add(shaftMesh);

  const pulleyGroup = new THREE.Group();
  pulleyGroup.position.set(0, 0, 2.75);
  const pulleyDisc = new THREE.Mesh(
    track(new THREE.CylinderGeometry(0.32, 0.32, 0.14, 28)),
    castFrameMat
  );
  pulleyDisc.rotation.x = Math.PI / 2;
  const pulleyTrim = new THREE.Mesh(
    track(new THREE.CylinderGeometry(0.22, 0.22, 0.15, 24)),
    machinedSteelMat
  );
  pulleyTrim.rotation.x = Math.PI / 2;
  const pulleyMarker = new THREE.Mesh(
    track(new THREE.BoxGeometry(0.055, 0.26, 0.16)),
    track(
      new THREE.MeshStandardMaterial({
        color: 0xf59e0b,
        roughness: 0.35,
        metalness: 0.2,
      })
    )
  );
  pulleyMarker.position.set(0, 0.14, 0);
  pulleyGroup.add(pulleyDisc, pulleyTrim, pulleyMarker);
  shaftGroup.add(pulleyGroup);
  tagPart(shaftGroup, 'eixo', partHitTargets);
  rotorGroup.add(shaftGroup);

  const coreGroup = new THREE.Group();
  coreGroup.position.set(0, 0, -0.35);

  const hCoreMesh = new THREE.Mesh(
    track(createArmatureCoreGeometry(0.84, 1.56)),
    laminationMat
  );
  hCoreMesh.castShadow = !isSoftwareGl;
  hCoreMesh.receiveShadow = !isSoftwareGl;
  coreGroup.add(hCoreMesh);

  const drumCoreGroup = new THREE.Group();
  const drumCylinder = new THREE.Mesh(
    track(new THREE.CylinderGeometry(0.58, 0.58, 1.56, 36)),
    laminationMat
  );
  drumCylinder.rotation.x = Math.PI / 2;
  drumCylinder.castShadow = !isSoftwareGl;
  drumCylinder.receiveShadow = !isSoftwareGl;
  drumCoreGroup.add(drumCylinder);

  const toothGeo = track(new THREE.BoxGeometry(0.22, 0.14, 1.56));
  const teethInstanced = new THREE.InstancedMesh(toothGeo, laminationMat, MAX_BARS);
  teethInstanced.castShadow = !isSoftwareGl;
  teethInstanced.frustumCulled = false;
  drumCoreGroup.add(teethInstanced);
  coreGroup.add(drumCoreGroup);

  const endPlateGeo = track(new THREE.CylinderGeometry(0.45, 0.45, 0.05, 24));
  const rearCollar = new THREE.Mesh(endPlateGeo, insulatorMat);
  rearCollar.rotation.x = Math.PI / 2;
  rearCollar.position.z = -0.82;
  const frontCollar = new THREE.Mesh(endPlateGeo, insulatorMat);
  frontCollar.rotation.x = Math.PI / 2;
  frontCollar.position.z = 0.82;
  coreGroup.add(rearCollar, frontCollar);
  tagPart(coreGroup, 'induzido', partHitTargets);
  rotorGroup.add(coreGroup);

  // Coils
  const coilsGroup = new THREE.Group();
  const singleCoilGroup = new THREE.Group();
  const singleCoilLoopCurves: THREE.CatmullRomCurve3[] = [];
  const loopOffsets = [
    { rx: 0.72, yOff: 0.0, zFront: 0.6, zBack: -1.32 },
    { rx: 0.62, yOff: 0.095, zFront: 0.64, zBack: -1.36 },
    { rx: 0.62, yOff: -0.095, zFront: 0.64, zBack: -1.36 },
  ];

  loopOffsets.forEach(({ rx, yOff, zFront, zBack }) => {
    const pts = [
      new THREE.Vector3(-rx, yOff, zFront - 0.14),
      new THREE.Vector3(-rx, yOff, zBack + 0.16),
      new THREE.Vector3(-rx * 0.72, yOff + 0.18, zBack),
      new THREE.Vector3(0, yOff + 0.25, zBack - 0.05),
      new THREE.Vector3(rx * 0.72, yOff + 0.18, zBack),
      new THREE.Vector3(rx, yOff, zBack + 0.16),
      new THREE.Vector3(rx, yOff, zFront - 0.14),
      new THREE.Vector3(rx * 0.72, yOff - 0.18, zFront),
      new THREE.Vector3(0, yOff - 0.25, zFront + 0.05),
      new THREE.Vector3(-rx * 0.72, yOff - 0.18, zFront),
    ];
    const curve = new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.22);
    singleCoilLoopCurves.push(curve);
    const tubeMesh = new THREE.Mesh(
      track(new THREE.TubeGeometry(curve, 96, 0.052, 12, true)),
      enameledCopperMat
    );
    tubeMesh.castShadow = !isSoftwareGl;
    singleCoilGroup.add(tubeMesh);
  });

  const leadCurveA = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.72, 0.0, 0.56),
    new THREE.Vector3(-0.62, 0.0, 0.85),
    new THREE.Vector3(-0.4, 0.0, 1.15),
  ]);
  const leadCurveB = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.72, 0.0, 0.56),
    new THREE.Vector3(0.62, 0.0, 0.85),
    new THREE.Vector3(0.4, 0.0, 1.15),
  ]);
  singleCoilGroup.add(
    new THREE.Mesh(
      track(new THREE.TubeGeometry(leadCurveA, 24, 0.036, 10, false)),
      enameledCopperMat
    ),
    new THREE.Mesh(
      track(new THREE.TubeGeometry(leadCurveB, 24, 0.036, 10, false)),
      enameledCopperMat
    )
  );
  coilsGroup.add(singleCoilGroup);

  const drumCoilCurve = createDrumCoilCurve(0.71, 0.62, -1.34);
  const drumCoilGeo = track(new THREE.TubeGeometry(drumCoilCurve, 64, 0.026, 8, true));
  const multiCoilsInstanced = new THREE.InstancedMesh(
    drumCoilGeo,
    enameledCopperMat,
    MAX_COILS
  );
  multiCoilsInstanced.castShadow = !isSoftwareGl;
  multiCoilsInstanced.frustumCulled = false;

  const riserCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.71, 0, 0.56),
    new THREE.Vector3(0.58, 0, 0.88),
    new THREE.Vector3(0.4, 0, 1.16),
  ]);
  const riserGeo = track(new THREE.TubeGeometry(riserCurve, 14, 0.019, 6, false));
  const risersInstanced = new THREE.InstancedMesh(riserGeo, enameledCopperMat, MAX_BARS);
  risersInstanced.frustumCulled = false;

  coilsGroup.add(multiCoilsInstanced, risersInstanced);
  tagPart(coilsGroup, 'bobinas', partHitTargets);
  rotorGroup.add(coilsGroup);

  // Commutator
  const commutatorGroup = new THREE.Group();
  commutatorGroup.position.set(0, 0, 1.45);

  const micaSleeve = new THREE.Mesh(
    track(new THREE.CylinderGeometry(0.355, 0.355, 0.66, 36)),
    micaMat
  );
  micaSleeve.rotation.x = Math.PI / 2;
  commutatorGroup.add(micaSleeve);

  const splitCommGroup = new THREE.Group();
  const gapHalf = 0.14;
  const segBMesh = new THREE.Mesh(
    track(
      createCommutatorSegmentGeometry(
        0.358,
        0.435,
        0.56,
        -Math.PI / 2 + gapHalf,
        Math.PI / 2 - gapHalf
      )
    ),
    commCopperMatB
  );
  const segAMesh = new THREE.Mesh(
    track(
      createCommutatorSegmentGeometry(
        0.358,
        0.435,
        0.56,
        Math.PI / 2 + gapHalf,
        (3 * Math.PI) / 2 - gapHalf
      )
    ),
    commCopperMatA
  );
  segBMesh.castShadow = !isSoftwareGl;
  segAMesh.castShadow = !isSoftwareGl;
  const lugGeo = track(new THREE.BoxGeometry(0.08, 0.08, 0.1));
  const lugA = new THREE.Mesh(lugGeo, brassMat);
  lugA.position.set(-0.4, 0, -0.3);
  const lugB = new THREE.Mesh(lugGeo, brassMat);
  lugB.position.set(0.4, 0, -0.3);
  splitCommGroup.add(segBMesh, segAMesh, lugA, lugB);
  commutatorGroup.add(splitCommGroup);

  const commBarGeo = track(new THREE.BoxGeometry(0.075, 0.24, 0.56));
  const multiCommInstanced = new THREE.InstancedMesh(commBarGeo, multiCommMat, MAX_BARS);
  multiCommInstanced.castShadow = !isSoftwareGl;
  multiCommInstanced.frustumCulled = false;
  commutatorGroup.add(multiCommInstanced);

  tagPart(commutatorGroup, 'comutador', partHitTargets);
  rotorGroup.add(commutatorGroup);

  // --- 6. Brushes & Brush Holders (pillars reaching BASE_TOP_Y) ---
  const brushesAllGroup = new THREE.Group();
  const holdersAllGroup = new THREE.Group();
  root.add(brushesAllGroup, holdersAllGroup);

  const buildBrushSide = (side: -1 | 1) => {
    const brushGroup = new THREE.Group();
    brushGroup.position.set(side * 0.66, 0, 1.45);

    const brushBlock = new THREE.Mesh(
      track(new THREE.BoxGeometry(0.44, 0.24, 0.38)),
      graphiteMat
    );
    brushBlock.castShadow = !isSoftwareGl;
    brushGroup.add(brushBlock);

    const bandMat = track(
      new THREE.MeshStandardMaterial({
        color: side === 1 ? 0xdc2626 : 0x2563eb,
        roughness: 0.45,
        metalness: 0.1,
      })
    );
    const polarityBand = new THREE.Mesh(
      track(new THREE.BoxGeometry(0.06, 0.25, 0.39)),
      bandMat
    );
    polarityBand.position.set(side * 0.19, 0, 0);
    brushGroup.add(polarityBand);
    brushesAllGroup.add(brushGroup);

    const holderGroup = new THREE.Group();
    holderGroup.position.set(0, 0, 1.45);

    const topWall = new THREE.Mesh(track(new THREE.BoxGeometry(0.56, 0.04, 0.44)), brassMat);
    topWall.position.set(side * 0.88, 0.145, 0);
    const botWall = new THREE.Mesh(track(new THREE.BoxGeometry(0.56, 0.04, 0.44)), brassMat);
    botWall.position.set(side * 0.88, -0.145, 0);
    const backStop = new THREE.Mesh(track(new THREE.BoxGeometry(0.05, 0.33, 0.44)), brassMat);
    backStop.position.set(side * 1.18, 0, 0);
    const frontRail = new THREE.Mesh(track(new THREE.BoxGeometry(0.56, 0.08, 0.04)), brassMat);
    frontRail.position.set(side * 0.88, -0.09, 0.21);
    const rearRail = new THREE.Mesh(track(new THREE.BoxGeometry(0.56, 0.08, 0.04)), brassMat);
    rearRail.position.set(side * 0.88, -0.09, -0.21);
    holderGroup.add(topWall, botWall, backStop, frontRail, rearRail);

    const springMesh = new THREE.Mesh(
      track(createSpringGeometry(0.068, 0.27, 6, 0.015)),
      springMat
    );
    if (side === 1) {
      springMesh.position.set(0.88, 0, 0);
    } else {
      springMesh.rotation.y = Math.PI;
      springMesh.position.set(-0.88, 0, 0);
    }
    holderGroup.add(springMesh);

    const postH = Math.abs(BASE_TOP_Y) - 0.14;
    const post = new THREE.Mesh(track(new THREE.BoxGeometry(0.2, postH, 0.24)), insulatorMat);
    post.position.set(side * 1.18, BASE_TOP_Y + postH * 0.5, 0);
    post.castShadow = !isSoftwareGl;
    holderGroup.add(post);

    const pigtailCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(side * 0.86, 0.14, 0.12),
      new THREE.Vector3(side * 1.34, 0.04, 0.28),
      new THREE.Vector3(side * 1.54, BASE_TOP_Y + 0.86, 0.42),
      new THREE.Vector3(side * 1.62, BASE_TOP_Y + 0.2, 0.54),
    ]);
    holderGroup.add(
      new THREE.Mesh(
        track(new THREE.TubeGeometry(pigtailCurve, 28, 0.022, 8, false)),
        enameledCopperMat
      )
    );

    const terminalBase = new THREE.Mesh(
      track(new THREE.CylinderGeometry(0.11, 0.12, 0.18, 20)),
      insulatorMat
    );
    terminalBase.position.set(side * 1.62, BASE_TOP_Y + 0.08, 0.54);
    const terminalNutMat = track(
      new THREE.MeshStandardMaterial({
        color: side === 1 ? 0xdc2626 : 0x2563eb,
        roughness: 0.35,
        metalness: 0.35,
      })
    );
    const terminalNut = new THREE.Mesh(
      track(new THREE.CylinderGeometry(0.075, 0.075, 0.14, 16)),
      terminalNutMat
    );
    terminalNut.position.set(side * 1.62, BASE_TOP_Y + 0.22, 0.54);
    holderGroup.add(terminalBase, terminalNut);

    holdersAllGroup.add(holderGroup);
    return { brushGroup, springMesh, bandMat, terminalNutMat };
  };

  const brushLeft = buildBrushSide(-1);
  const brushRight = buildBrushSide(1);
  tagPart(brushesAllGroup, 'escovas', partHitTargets);
  tagPart(holdersAllGroup, 'porta-escovas', partHitTargets);

  const sparkMat = track(
    new THREE.MeshBasicMaterial({
      color: 0xfef08a,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  const sparkGeo = track(new THREE.SphereGeometry(0.055, 12, 12));
  const sparkLeft = new THREE.Mesh(sparkGeo, sparkMat);
  sparkLeft.position.set(-0.44, 0.04, 1.45);
  const sparkRight = new THREE.Mesh(sparkGeo, sparkMat);
  sparkRight.position.set(0.44, -0.04, 1.45);
  root.add(sparkLeft, sparkRight);

  // --- 7. Vector Overlay: Rotating / Oscillating Magnetic Flux Grid B(t) + Multi-Arrow Force F ---
  const vectorsGroup = new THREE.Group();
  root.add(vectorsGroup);

  const fluxGridGroup = new THREE.Group();
  fluxGridGroup.position.set(0, 0, -0.35);
  vectorsGroup.add(fluxGridGroup);

  const fluxMat = track(
    new THREE.MeshBasicMaterial({
      color: 0x0284c7,
      transparent: true,
      opacity: 0.45,
    })
  );
  const fluxYOffsets = [-0.52, 0, 0.52];
  const fluxZOffsets = [-0.5, 0, 0.5];
  fluxZOffsets.forEach((fz) => {
    fluxYOffsets.forEach((fy) => {
      const lineCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(-0.98, fy, fz),
        new THREE.Vector3(0, fy * 0.86, fz),
        new THREE.Vector3(0.98, fy, fz),
      ]);
      const tube = new THREE.Mesh(
        track(new THREE.TubeGeometry(lineCurve, 14, 0.011, 6, false)),
        fluxMat
      );
      const cone = new THREE.Mesh(track(new THREE.ConeGeometry(0.036, 0.1, 10)), fluxMat);
      cone.rotation.z = -Math.PI / 2;
      cone.position.set(0.55, fy * 0.92, fz);
      fluxGridGroup.add(tube, cone);
    });
  });

  const forceMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x10b981,
      roughness: 0.35,
      metalness: 0.15,
      emissive: 0x10b981,
      emissiveIntensity: 0.25,
    })
  );
  const forceShaftGeo = track(new THREE.CylinderGeometry(0.02, 0.02, 0.44, 10));
  forceShaftGeo.translate(0, 0.22, 0);
  const forceHeadGeo = track(new THREE.ConeGeometry(0.052, 0.14, 12));
  forceHeadGeo.translate(0, 0.51, 0);

  const forceShaftsInstanced = new THREE.InstancedMesh(
    forceShaftGeo,
    forceMat,
    MAX_FORCE_ARROWS
  );
  const forceHeadsInstanced = new THREE.InstancedMesh(
    forceHeadGeo,
    forceMat,
    MAX_FORCE_ARROWS
  );
  forceShaftsInstanced.frustumCulled = false;
  forceHeadsInstanced.frustumCulled = false;
  vectorsGroup.add(forceShaftsInstanced, forceHeadsInstanced);

  // --- 8. Animated AC Current Flow Particles (Rotor & Pigtails) ---
  const particleGeo = track(new THREE.SphereGeometry(0.034, 10, 10));
  const particleMat = track(new THREE.MeshBasicMaterial({ color: 0xf59e0b }));

  const coilParticles = new THREE.InstancedMesh(
    particleGeo,
    particleMat,
    MAX_COIL_PARTICLES
  );
  coilParticles.frustumCulled = false;
  rotorGroup.add(coilParticles);

  const extParticleCount = 12;
  const extParticles = new THREE.InstancedMesh(particleGeo, particleMat, extParticleCount);
  extParticles.frustumCulled = false;
  root.add(extParticles);

  const pigtailWorldRight = new THREE.CatmullRomCurve3([
    new THREE.Vector3(1.62, BASE_TOP_Y + 0.2, 1.99),
    new THREE.Vector3(1.54, BASE_TOP_Y + 0.86, 1.87),
    new THREE.Vector3(1.34, 0.04, 1.73),
    new THREE.Vector3(0.86, 0.14, 1.57),
    new THREE.Vector3(0.46, 0.0, 1.45),
  ]);
  const pigtailWorldLeft = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.46, 0.0, 1.45),
    new THREE.Vector3(-0.86, 0.14, 1.57),
    new THREE.Vector3(-1.34, 0.04, 1.73),
    new THREE.Vector3(-1.54, BASE_TOP_Y + 0.86, 1.87),
    new THREE.Vector3(-1.62, BASE_TOP_Y + 0.2, 1.99),
  ]);

  // --- 9. Callout Anchors ---
  const createAnchor = (x: number, y: number, z: number, parent: THREE.Object3D = root) => {
    const obj = new THREE.Object3D();
    obj.position.set(x, y, z);
    parent.add(obj);
    return obj;
  };

  const partAnchors: Record<MotorPartId, THREE.Object3D> = {
    'bobinas-estator': createAnchor(-1.62, 0.72, -0.35, root),
    estator: createAnchor(1.48, 1.12, -0.35, root),
    induzido: createAnchor(0, 0.96, -0.35, root),
    bobinas: createAnchor(-0.78, 0.32, -0.35, root),
    comutador: createAnchor(0, 0.56, 1.45, root),
    escovas: createAnchor(0.7, 0.26, 1.45, root),
    'porta-escovas': createAnchor(-1.18, 0.32, 1.45, holdersAllGroup),
    eixo: createAnchor(0, 0.34, 2.75, root),
    neutro: createAnchor(-1.92, BASE_TOP_Y + 0.52, 2.18, root),
  };

  let currentPhase = 0;
  let dampedExplode = 0;
  let sparkTimer = 0;
  let appliedCoilCount = -1;

  const configureCoilGeometryCount = (n: number) => {
    appliedCoilCount = n;
    const isSingle = n === 1;

    hCoreMesh.visible = isSingle;
    drumCoreGroup.visible = !isSingle;
    singleCoilGroup.visible = isSingle;
    multiCoilsInstanced.visible = !isSingle;
    risersInstanced.visible = !isSingle;
    splitCommGroup.visible = isSingle;
    multiCommInstanced.visible = !isSingle;

    if (!isSingle) {
      const barCount = n * 2;
      teethInstanced.count = barCount;
      multiCoilsInstanced.count = n;
      risersInstanced.count = barCount;
      multiCommInstanced.count = barCount;

      const toothWidthScale = Math.min(1.0, 9.5 / n);
      const barWidthScale = Math.min(1.0, 9.5 / n);
      const coilThicknessScale = Math.max(0.55, Math.min(1.15, 10 / n));

      for (let j = 0; j < barCount; j++) {
        const theta = ((j + 0.5) * Math.PI) / n;
        _vec3A.set(Math.cos(theta) * 0.69, Math.sin(theta) * 0.69, 0);
        _eulerA.set(0, 0, theta);
        _quatA.setFromEuler(_eulerA);
        _scale.set(1, toothWidthScale, 1);
        _mat4.compose(_vec3A, _quatA, _scale);
        teethInstanced.setMatrixAt(j, _mat4);

        const commTheta = (j * Math.PI) / n;
        _vec3A.set(Math.cos(commTheta) * 0.398, Math.sin(commTheta) * 0.398, 0);
        _eulerA.set(0, 0, commTheta);
        _quatA.setFromEuler(_eulerA);
        _scale.set(1, barWidthScale, 1);
        _mat4.compose(_vec3A, _quatA, _scale);
        multiCommInstanced.setMatrixAt(j, _mat4);

        _vec3A.set(0, 0, 0);
        _eulerA.set(0, 0, commTheta);
        _quatA.setFromEuler(_eulerA);
        _scale.set(1, coilThicknessScale, 1);
        _mat4.compose(_vec3A, _quatA, _scale);
        risersInstanced.setMatrixAt(j, _mat4);
      }

      for (let k = 0; k < n; k++) {
        const coilTheta = (k * Math.PI) / n;
        _vec3A.set(0, 0, 0);
        _eulerA.set(0, 0, coilTheta);
        _quatA.setFromEuler(_eulerA);
        const endTurnStagger = 1 + (k % 3) * 0.032;
        _scale.set(coilThicknessScale, coilThicknessScale, endTurnStagger);
        _mat4.compose(_vec3A, _quatA, _scale);
        multiCoilsInstanced.setMatrixAt(k, _mat4);
      }

      teethInstanced.instanceMatrix.needsUpdate = true;
      multiCoilsInstanced.instanceMatrix.needsUpdate = true;
      risersInstanced.instanceMatrix.needsUpdate = true;
      multiCommInstanced.instanceMatrix.needsUpdate = true;
    }
  };

  const updateStatorPolesVisuals = (
    poles: DynamicPoleItem[],
    acPhaseRad: number,
    phaseLagRad: number,
    vScale: number,
    fieldDirection: 1 | -1,
    showParticles: boolean,
    explodeVal: number
  ) => {
    const northHex = 0xc83e3b;
    const southHex = 0x2563eb;
    const neutralHex = 0x64748b;

    poles.forEach((pole) => {
      const poleCurrent =
        vScale * Math.sin(acPhaseRad + pole.phaseOffsetRad - phaseLagRad) * pole.polaritySign * fieldDirection;
      const absLevel = Math.abs(poleCurrent);
      const isNeutral = absLevel < 0.06;
      const isNorth = poleCurrent >= 0;

      pole.northPlane.visible = !isNeutral && isNorth;
      pole.southPlane.visible = !isNeutral && !isNorth;

      _colorTarget.setHex(isNorth ? northHex : southHex);
      pole.mat.color.setHex(neutralHex).lerp(_colorTarget, Math.min(1, absLevel * 1.45));

      // Explode stator coils slightly outward along their radial axis
      if (poles.length === 2) {
        const side = Math.cos(pole.angleRad) >= 0 ? 1 : -1;
        pole.poleGroup.position.x = side * explodeVal * 1.15;
        pole.coilGroup.position.x = side * explodeVal * 0.42;
      } else {
        pole.poleGroup.position.x = explodeVal * 0.35;
        pole.coilGroup.position.x = explodeVal * 0.22;
      }

      pole.particles.visible = showParticles && absLevel > 0.05;
      if (pole.particles.visible) {
        const numTurns = pole.coilCurves.length;
        const perTurn = Math.floor(pole.particles.count / numTurns);
        const flowDir = poleCurrent >= 0 ? 1 : -1;
        for (let tIdx = 0; tIdx < numTurns; tIdx++) {
          const curve = pole.coilCurves[tIdx];
          for (let k = 0; k < perTurn; k++) {
            let u = (k / perTurn + (flowDir > 0 ? currentPhase : 1 - currentPhase)) % 1;
            if (u < 0) u += 1;
            curve.getPointAt(u, _vec3A);
            _quatA.identity();
            _scale.setScalar(0.88);
            _mat4.compose(_vec3A, _quatA, _scale);
            pole.particles.setMatrixAt(tIdx * perTurn + k, _mat4);
          }
        }
        pole.particles.instanceMatrix.needsUpdate = true;
      }
    });
  };

  const update = (
    dt: number,
    rotorAngle: number,
    acPhaseRad: number,
    opts: MotorVisualOptions
  ): MotorLiveTelemetry => {
    const nCoils = Math.max(1, Math.min(MAX_COILS, Math.round(opts.coilCount)));
    if (nCoils !== appliedCoilCount) {
      configureCoilGeometryCount(nCoils);
    }

    // 1. Toggle active Stator Phase Configuration (1Φ / 2Φ / 3Φ) & Terminal Labels
    stator1PhGroup.visible = opts.phaseMode === 'monofasico';
    stator2Ph.group.visible = opts.phaseMode === 'bifasico';
    stator3Ph.group.visible = opts.phaseMode === 'trifasico';

    postP1A.visible = opts.phaseMode === 'monofasico' || opts.phaseMode === 'bifasico';
    postP2A.visible = opts.phaseMode === 'bifasico';
    postR.visible = opts.phaseMode === 'trifasico';
    postS.visible = opts.phaseMode === 'trifasico';
    postT.visible = opts.phaseMode === 'trifasico';

    // 2. Exploded view smooth damping
    dampedExplode = THREE.MathUtils.damp(dampedExplode, opts.explode, 7.5, Math.min(dt, 0.05));

    stator2Ph.group.position.z = -dampedExplode * 0.45;
    stator3Ph.group.position.z = -dampedExplode * 0.45;
    commutatorGroup.position.z = 1.45 + dampedExplode * 0.55;
    coilsGroup.position.z = dampedExplode * 0.28;
    coreGroup.position.z = -0.35 - dampedExplode * 0.25;
    brushLeft.brushGroup.position.x = -0.66 - dampedExplode * 0.7;
    brushRight.brushGroup.position.x = 0.66 + dampedExplode * 0.7;
    holdersAllGroup.children[0].position.x = -dampedExplode * 0.9;
    holdersAllGroup.children[1].position.x = dampedExplode * 0.9;

    partAnchors.induzido.position.z = -0.35 - dampedExplode * 0.25;
    partAnchors.bobinas.position.z = -0.35 + dampedExplode * 0.28;
    partAnchors.comutador.position.z = 1.45 + dampedExplode * 0.55;
    partAnchors.escovas.position.x = 0.68 + dampedExplode * 0.7;
    partAnchors['porta-escovas'].position.x = -1.18 - dampedExplode * 0.9;
    partAnchors['bobinas-estator'].position.x =
      opts.phaseMode === 'monofasico' ? -1.62 - dampedExplode * 1.15 : -1.45;
    partAnchors.estator.position.x =
      opts.phaseMode === 'monofasico' ? 1.48 + dampedExplode * 1.15 : 1.48;

    // 3. Rotor angle & commutator bar tracking
    rotorGroup.rotation.z = rotorAngle;
    const normAngle = ((rotorAngle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const angleDeg = (normAngle * 180) / Math.PI;
    const barCount = nCoils * 2;
    const barStep = (Math.PI * 2) / barCount;
    const nearestBarIdx =
      Math.round(((Math.PI * 2 - normAngle) % (Math.PI * 2)) / barStep) % barCount;
    const angularDistToBarCenter = Math.abs(
      Math.atan2(
        Math.sin(normAngle + nearestBarIdx * barStep),
        Math.cos(normAngle + nearestBarIdx * barStep)
      )
    );
    const isCommutating =
      nCoils === 1
        ? Math.abs(Math.cos(normAngle)) < 0.12
        : angularDistToBarCenter > barStep * 0.38;

    const activeSegmentAtPositiveBrush =
      nCoils === 1
        ? isCommutating
          ? 'Fenda Isolante'
          : Math.cos(normAngle) >= 0
          ? 'B'
          : 'A'
        : isCommutating
        ? 'Fenda Isolante'
        : `#${nearestBarIdx + 1} de ${barCount}`;

    // 4. Multi-Phase Voltages, Currents & Resultant Magnetic Field Vector (Bx, By)
    const vScale = opts.voltageRms / 220;
    const phaseLagRad = (opts.phaseLagDeg * Math.PI) / 180;
    const vPeak = 220 * Math.SQRT2 * vScale;
    const iPeak = 10 * Math.SQRT2 * vScale;

    const v1Norm = vScale * Math.sin(acPhaseRad);
    const v2Norm =
      opts.phaseMode === 'bifasico'
        ? vScale * Math.sin(acPhaseRad - Math.PI / 2)
        : opts.phaseMode === 'trifasico'
        ? vScale * Math.sin(acPhaseRad - (2 * Math.PI) / 3)
        : 0;
    const v3Norm =
      opts.phaseMode === 'trifasico'
        ? vScale * Math.sin(acPhaseRad - (4 * Math.PI) / 3)
        : 0;

    let i1Norm = vScale * Math.sin(acPhaseRad - phaseLagRad);
    const rippleDepth = nCoils === 1 ? 0.18 : Math.max(0.02, 0.14 / Math.sqrt(nCoils));
    if (isCommutating && opts.voltageRms > 5) {
      i1Norm *= 1 - rippleDepth;
    }

    let bx = 0;
    let by = 0;
    if (opts.phaseMode === 'monofasico') {
      bx = i1Norm * opts.fieldDirection;
      by = 0;
    } else if (opts.phaseMode === 'bifasico') {
      const i2Norm = vScale * Math.sin(acPhaseRad - Math.PI / 2 - phaseLagRad);
      bx = i1Norm * opts.fieldDirection;
      by = i2Norm;
    } else {
      const i2Norm = vScale * Math.sin(acPhaseRad - (2 * Math.PI) / 3 - phaseLagRad);
      const i3Norm = vScale * Math.sin(acPhaseRad - (4 * Math.PI) / 3 - phaseLagRad);
      bx = (2 / 3) * (i1Norm - 0.5 * i2Norm - 0.5 * i3Norm) * opts.fieldDirection;
      by = (2 / 3) * ((Math.sqrt(3) / 2) * (i2Norm - i3Norm));
    }

    const bMag = Math.hypot(bx, by);
    const fieldAngleRad = Math.atan2(by, bx);
    const fieldAngleDeg = (((fieldAngleRad * 180) / Math.PI) + 360) % 360;

    const speedMag = Math.max(Math.abs(i1Norm), bMag) * 1.65;
    if (speedMag > 0.04) {
      currentPhase = (currentPhase + dt * speedMag) % 1;
    }

    // Update visible stator poles & stator coil particles
    const showActiveParticles = opts.showCurrent && (Math.abs(i1Norm) > 0.05 || bMag > 0.05);
    if (opts.phaseMode === 'monofasico') {
      updateStatorPolesVisuals(
        poles1Ph,
        acPhaseRad,
        phaseLagRad,
        vScale,
        opts.fieldDirection,
        showActiveParticles,
        dampedExplode
      );
    } else if (opts.phaseMode === 'bifasico') {
      updateStatorPolesVisuals(
        stator2Ph.poles,
        acPhaseRad,
        phaseLagRad,
        vScale,
        opts.fieldDirection,
        showActiveParticles,
        dampedExplode
      );
    } else {
      updateStatorPolesVisuals(
        stator3Ph.poles,
        acPhaseRad,
        phaseLagRad,
        vScale,
        opts.fieldDirection,
        showActiveParticles,
        dampedExplode
      );
    }

    const leftPole: 'N' | 'S' | 'Neutro' =
      bMag < 0.06 ? 'Neutro' : bx >= 0 ? 'N' : 'S';
    const rightPole: 'N' | 'S' | 'Neutro' =
      bMag < 0.06 ? 'Neutro' : bx >= 0 ? 'S' : 'N';

    // Brushes & Commutator visuals:
    // Left brush is wired to constant Neutral (N / 0 V, blue); Right brush alternates Phase (+V red / 0V slate / -V violet)
    const acSign = i1Norm >= 0 ? 1 : -1;
    const rightBrushHex = Math.abs(i1Norm) < 0.06 ? 0x64748b : acSign > 0 ? 0xdc2626 : 0x9333ea;
    brushRight.bandMat.color.setHex(rightBrushHex);
    brushRight.terminalNutMat.color.setHex(rightBrushHex);
    brushLeft.bandMat.color.setHex(0x2563eb);
    brushLeft.terminalNutMat.color.setHex(0x2563eb);

    const cosTheta = Math.cos(normAngle);
    const coilSign: 1 | -1 | 0 =
      isCommutating || Math.abs(i1Norm) < 0.05
        ? 0
        : ((cosTheta >= 0 ? 1 : -1) * acSign) as 1 | -1;

    if (isCommutating || Math.abs(i1Norm) < 0.05) {
      commCopperMatA.color.setHex(0xd48754);
      commCopperMatB.color.setHex(0xd48754);
    } else if (cosTheta * acSign > 0) {
      commCopperMatB.color.setHex(0xe87b56);
      commCopperMatA.color.setHex(0xbf7d58);
    } else {
      commCopperMatA.color.setHex(0xe87b56);
      commCopperMatB.color.setHex(0xbf7d58);
    }

    const springCompression = 1 - Math.sin(normAngle * barCount) * 0.025;
    brushLeft.springMesh.scale.x = springCompression;
    brushRight.springMesh.scale.x = springCompression;

    if (isCommutating && Math.abs(i1Norm) > 0.14 && dampedExplode < 0.15) {
      sparkTimer += dt * 42;
      const sparkScaleFactor = nCoils === 1 ? 1.0 : Math.max(0.35, 1.2 / Math.sqrt(nCoils));
      sparkMat.opacity =
        (0.35 + 0.4 * Math.sin(sparkTimer * 3.1)) *
        Math.min(1, Math.abs(i1Norm) * 1.4) *
        sparkScaleFactor;
      sparkLeft.scale.setScalar((0.65 + 0.45 * Math.abs(Math.sin(sparkTimer))) * sparkScaleFactor);
      sparkRight.scale.setScalar((0.65 + 0.45 * Math.abs(Math.cos(sparkTimer))) * sparkScaleFactor);
    } else {
      sparkMat.opacity = THREE.MathUtils.damp(sparkMat.opacity, 0, 18, Math.min(dt, 0.05));
    }

    // 5. Hover / Selection Emissive Highlights
    for (const entry of highlightRegistry) {
      const isSelected = opts.selectedPart === entry.partId;
      const isHovered = opts.hoveredPart === entry.partId;
      const targetEmissive = isSelected ? 0.28 : isHovered ? 0.16 : 0.0;
      if (isSelected || isHovered) {
        entry.mat.emissive.setHex(0x2563eb);
      }
      entry.mat.emissiveIntensity = THREE.MathUtils.damp(
        entry.mat.emissiveIntensity,
        targetEmissive,
        10,
        Math.min(dt, 0.05)
      );
    }

    // 6. Rotor & Pigtail Current Particles
    coilParticles.visible = showActiveParticles && !(nCoils === 1 && isCommutating);
    extParticles.visible = showActiveParticles && dampedExplode < 0.15;

    if (coilParticles.visible) {
      if (nCoils === 1) {
        const pCount = 34;
        coilParticles.count = pCount;
        const mainCurve = singleCoilLoopCurves[0];
        for (let i = 0; i < pCount; i++) {
          let u = (i / pCount + (coilSign >= 0 ? currentPhase : 1 - currentPhase)) % 1;
          if (u < 0) u += 1;
          mainCurve.getPointAt(u, _vec3A);
          _vec3A.z += coilsGroup.position.z;
          _quatA.identity();
          _scale.setScalar(1);
          _mat4.compose(_vec3A, _quatA, _scale);
          coilParticles.setMatrixAt(i, _mat4);
        }
      } else {
        const perCoil = Math.max(4, Math.floor(MAX_COIL_PARTICLES / nCoils));
        const totalParticles = Math.min(MAX_COIL_PARTICLES, nCoils * perCoil);
        coilParticles.count = totalParticles;
        const pScale = Math.max(0.55, Math.min(0.95, 7 / nCoils));
        let idx = 0;
        for (let k = 0; k < nCoils && idx < totalParticles; k++) {
          const coilTheta = (k * Math.PI) / nCoils;
          const localSign = Math.cos(normAngle + coilTheta) * acSign >= 0 ? 1 : -1;
          const cosC = Math.cos(coilTheta);
          const sinC = Math.sin(coilTheta);
          for (let m = 0; m < perCoil && idx < totalParticles; m++) {
            let u = (m / perCoil + (localSign > 0 ? currentPhase : 1 - currentPhase)) % 1;
            if (u < 0) u += 1;
            drumCoilCurve.getPointAt(u, _vec3A);
            const rx = _vec3A.x * cosC - _vec3A.y * sinC;
            const ry = _vec3A.x * sinC + _vec3A.y * cosC;
            _vec3B.set(rx, ry, _vec3A.z + coilsGroup.position.z);
            _quatA.identity();
            _scale.setScalar(pScale);
            _mat4.compose(_vec3B, _quatA, _scale);
            coilParticles.setMatrixAt(idx++, _mat4);
          }
        }
      }
      coilParticles.instanceMatrix.needsUpdate = true;
    }

    if (extParticles.visible) {
      const half = extParticleCount / 2;
      for (let i = 0; i < half; i++) {
        let u = (i / half + (acSign > 0 ? currentPhase : 1 - currentPhase)) % 1;
        if (u < 0) u += 1;
        pigtailWorldRight.getPointAt(u, _vec3A);
        _quatA.identity();
        _scale.setScalar(0.85);
        _mat4.compose(_vec3A, _quatA, _scale);
        extParticles.setMatrixAt(i, _mat4);

        pigtailWorldLeft.getPointAt(u, _vec3B);
        _mat4.compose(_vec3B, _quatA, _scale);
        extParticles.setMatrixAt(i + half, _mat4);
      }
      extParticles.instanceMatrix.needsUpdate = true;
    }

    // 7. Rotating/Oscillating Magnetic Flux Grid B(t) + Tangential Multi-Arrow Lorentz Force F
    vectorsGroup.visible = opts.showVectors;
    if (opts.showVectors) {
      fluxGridGroup.visible = bMag > 0.04;
      fluxMat.opacity = Math.max(0.08, Math.min(0.72, bMag * 0.72));
      if (bMag > 0.04) {
        fluxGridGroup.rotation.z = fieldAngleRad;
      }

      let arrowCount = 0;
      if (bMag > 0.05) {
        const zPositions =
          nCoils <= 4 ? [-0.88, -0.35, 0.18] : nCoils <= 12 ? [-0.72, 0.02] : [-0.35];
        const sideRadius = 0.87;
        const arrowWidthScale = nCoils <= 6 ? 1.0 : Math.max(0.62, 1.05 - nCoils * 0.018);
        const normBx = bx / bMag;
        const normBy = by / bMag;

        for (let j = 0; j < barCount && arrowCount < MAX_FORCE_ARROWS; j++) {
          const phi = rotorAngle + (j * Math.PI) / nCoils;
          const cosPhi = Math.cos(phi);
          const sinPhi = Math.sin(phi);
          // Alignment with instantaneous magnetic field B(t)
          const alignB = cosPhi * normBx + sinPhi * normBy;
          const absAlign = Math.abs(alignB);
          if (absAlign < 0.24) continue;
          if (nCoils === 1 && isCommutating) continue;

          const wx = cosPhi * sideRadius;
          const wy = sinPhi * sideRadius;
          const tangentRot =
            opts.fieldDirection > 0 ? phi : phi + Math.PI;
          const mag = Math.min(1.15, bMag * absAlign * 1.12);

          _eulerA.set(0, 0, tangentRot);
          _quatA.setFromEuler(_eulerA);
          _scale.set(arrowWidthScale, mag, arrowWidthScale);

          for (let zi = 0; zi < zPositions.length && arrowCount < MAX_FORCE_ARROWS; zi++) {
            _vec3A.set(wx, wy, zPositions[zi] + coilsGroup.position.z);
            _mat4.compose(_vec3A, _quatA, _scale);
            forceShaftsInstanced.setMatrixAt(arrowCount, _mat4);
            forceHeadsInstanced.setMatrixAt(arrowCount, _mat4);
            arrowCount++;
          }
        }
      }

      forceShaftsInstanced.count = arrowCount;
      forceHeadsInstanced.count = arrowCount;
      forceShaftsInstanced.instanceMatrix.needsUpdate = true;
      forceHeadsInstanced.instanceMatrix.needsUpdate = true;
    }

    let sumTorque = 0;
    for (let k = 0; k < nCoils; k++) {
      sumTorque += Math.abs(Math.cos(normAngle + (k * Math.PI) / nCoils));
    }
    const avgGeomFactor = sumTorque / nCoils;

    const rpm = Math.round(vScale * 2400);
    return {
      angleDeg,
      rpm,
      acPhaseRad,
      phaseMode: opts.phaseMode,
      v1Volts: v1Norm * vPeak / Math.max(0.001, vScale),
      v2Volts: v2Norm * vPeak / Math.max(0.001, vScale),
      v3Volts: v3Norm * vPeak / Math.max(0.001, vScale),
      i1Amps: i1Norm * iPeak / Math.max(0.001, vScale),
      iNorm: i1Norm,
      neutralVolts: 0,
      fieldAngleDeg,
      leftPole,
      rightPole,
      isCommutating,
      activeSegmentAtPositiveBrush,
      torqueNormalized: avgGeomFactor * Math.min(1, bMag),
      commutatorBarsCount: barCount,
    };
  };

  const dispose = () => {
    disposables.forEach((d) => d.dispose());
  };

  return {
    root,
    partHitTargets,
    partAnchors,
    update,
    dispose,
  };
}
