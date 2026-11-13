import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { MOTOR_PARTS, MotorPartId, PhaseMode } from '../data/motorParts';
import { createMotorAssembly, MotorLiveTelemetry } from '../three/motorModel';

export interface CameraTargetState {
  position: [number, number, number];
  target: [number, number, number];
  nonce: number;
}

interface MotorViewportProps {
  isPlaying: boolean;
  stepPulse: number;
  voltageRms: number;
  phaseLagDeg: number;
  phaseMode: PhaseMode;
  coilCount: number;
  animSpeed: number;
  acVisualHz: number;
  fieldDirection: 1 | -1;
  explode: number;
  showCurrent: boolean;
  showVectors: boolean;
  showLabels: boolean;
  selectedPart: MotorPartId | null;
  cameraRequest: CameraTargetState;
  onSelectPart: (partId: MotorPartId | null) => void;
  onTelemetryUpdate: (telemetry: MotorLiveTelemetry) => void;
}

// Reusable projection vectors (zero GC)
const _projVec = new THREE.Vector3();
const _targetCamPos = new THREE.Vector3();
const _targetCtrlPos = new THREE.Vector3();

export const MotorViewport: React.FC<MotorViewportProps> = ({
  isPlaying,
  stepPulse,
  voltageRms,
  phaseLagDeg,
  phaseMode,
  coilCount,
  animSpeed,
  acVisualHz,
  fieldDirection,
  explode,
  showCurrent,
  showVectors,
  showLabels,
  selectedPart,
  cameraRequest,
  onSelectPart,
  onTelemetryUpdate,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const labelRefs = useRef<Record<MotorPartId, HTMLButtonElement | null>>({
    'bobinas-estator': null,
    estator: null,
    induzido: null,
    bobinas: null,
    comutador: null,
    escovas: null,
    'porta-escovas': null,
    eixo: null,
    neutro: null,
  });

  const [hoveredPart, setHoveredPart] = useState<MotorPartId | null>(null);
  const [webglError, setWebglError] = useState<string | null>(null);

  const stateRef = useRef({
    isPlaying,
    voltageRms,
    phaseLagDeg,
    phaseMode,
    coilCount,
    animSpeed,
    acVisualHz,
    fieldDirection,
    explode,
    showCurrent,
    showVectors,
    showLabels,
    selectedPart,
    hoveredPart,
  });
  stateRef.current = {
    isPlaying,
    voltageRms,
    phaseLagDeg,
    phaseMode,
    coilCount,
    animSpeed,
    acVisualHz,
    fieldDirection,
    explode,
    showCurrent,
    showVectors,
    showLabels,
    selectedPart,
    hoveredPart,
  };

  const callbacksRef = useRef({ onSelectPart, onTelemetryUpdate });
  callbacksRef.current = { onSelectPart, onTelemetryUpdate };

  const rotorAngleRef = useRef(0);
  const acPhaseRef = useRef(0.55);
  const forceTelemetrySyncRef = useRef(false);

  const cameraTransitionRef = useRef<{
    active: boolean;
    position: [number, number, number];
    target: [number, number, number];
  }>({
    active: false,
    position: cameraRequest.position,
    target: cameraRequest.target,
  });

  useEffect(() => {
    cameraTransitionRef.current = {
      active: true,
      position: cameraRequest.position,
      target: cameraRequest.target,
    };
  }, [cameraRequest]);

  const lastStepPulseRef = useRef(stepPulse);
  useEffect(() => {
    if (stepPulse !== lastStepPulseRef.current) {
      lastStepPulseRef.current = stepPulse;
      rotorAngleRef.current += ((15 * Math.PI) / 180) * stateRef.current.fieldDirection;
      acPhaseRef.current += (18 * Math.PI) / 180;
      forceTelemetrySyncRef.current = true;
    }
  }, [stepPulse]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = (() => {
      try {
        const probe = document.createElement('canvas');
        const gl = probe.getContext('webgl2') || probe.getContext('webgl');
        if (!gl) return true;
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
        const gpu = String(gl.getParameter(param));
        gl.getExtension('WEBGL_lose_context')?.loseContext();
        return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
      } catch {
        return true;
      }
    })();

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        powerPreference: 'high-performance',
      });
    } catch {
      setWebglError('Não foi possível inicializar o contexto WebGL 3D neste navegador.');
      return;
    }

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    renderer.setSize(width, height);
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    const handleContextLost = (e: Event) => {
      e.preventDefault();
      setWebglError('Contexto gráfico 3D temporariamente suspenso. Recarregue para restaurar.');
    };
    const handleContextRestored = () => {
      setWebglError(null);
    };
    renderer.domElement.addEventListener('webglcontextlost', handleContextLost);
    renderer.domElement.addEventListener('webglcontextrestored', handleContextRestored);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf4f6f9);
    scene.fog = new THREE.Fog(0xf4f6f9, 14, 28);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envTarget = pmremGenerator.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = envTarget.texture;
    pmremGenerator.dispose();

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100);
    camera.position.set(...cameraRequest.position);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(...cameraRequest.target);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.06;
    controls.minDistance = 2.0;
    controls.maxDistance = 12.0;
    controls.maxPolarAngle = Math.PI * 0.56;
    controls.minPolarAngle = 0.12;
    controls.update();

    const stopAutoCamera = () => {
      cameraTransitionRef.current.active = false;
    };
    controls.addEventListener('start', stopAutoCamera);

    // 3-Point Warm/Cool Studio Lighting
    const hemiLight = new THREE.HemisphereLight(0xeef4ff, 0xdbe2ea, 0.72);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff5e8, 1.85);
    keyLight.position.set(5.5, 7.5, 5.2);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.near = 1;
    keyLight.shadow.camera.far = 22;
    keyLight.shadow.camera.left = -4.5;
    keyLight.shadow.camera.right = 4.5;
    keyLight.shadow.camera.top = 4.5;
    keyLight.shadow.camera.bottom = -4.5;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0xdbeafe, 0.9);
    rimLight.position.set(-5.0, 4.0, -5.5);
    scene.add(rimLight);

    if (!isSoftwareGl) {
      RectAreaLightUniformsLib.init();
      const softboxLight = new THREE.RectAreaLight(0xffffff, 2.2, 5, 2.5);
      softboxLight.position.set(0, 4.5, 2.2);
      softboxLight.lookAt(0, 0, 0.5);
      scene.add(softboxLight);
    }

    const gridHelper = new THREE.GridHelper(20, 24, 0xcbd5e1, 0xe2e8f0);
    gridHelper.position.y = -2.04;
    scene.add(gridHelper);

    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    const motor = createMotorAssembly(maxAniso, isSoftwareGl);
    scene.add(motor.root);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    // Raycasting
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const hitMeshes = Array.from(motor.partHitTargets.keys());
    let lastHoverCheck = 0;
    let pointerDownPos = { x: 0, y: 0 };

    const updatePointerNdc = (e: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    };

    const handlePointerDown = (e: PointerEvent) => {
      pointerDownPos = { x: e.clientX, y: e.clientY };
    };

    const handlePointerMove = (e: PointerEvent) => {
      const now = performance.now();
      if (now - lastHoverCheck < 50) return;
      lastHoverCheck = now;

      updatePointerNdc(e);
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(hitMeshes, false);
      if (hits.length > 0) {
        const partId = motor.partHitTargets.get(hits[0].object) ?? null;
        setHoveredPart(partId);
        renderer.domElement.style.cursor = partId ? 'pointer' : 'grab';
      } else {
        setHoveredPart(null);
        renderer.domElement.style.cursor = 'grab';
      }
    };

    const handlePointerUp = (e: PointerEvent) => {
      const dx = e.clientX - pointerDownPos.x;
      const dy = e.clientY - pointerDownPos.y;
      if (dx * dx + dy * dy > 25) return;

      updatePointerNdc(e);
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(hitMeshes, false);
      if (hits.length > 0) {
        const partId = motor.partHitTargets.get(hits[0].object) ?? null;
        if (partId) {
          callbacksRef.current.onSelectPart(partId);
        }
      }
    };

    renderer.domElement.addEventListener('pointerdown', handlePointerDown);
    renderer.domElement.addEventListener('pointermove', handlePointerMove);
    renderer.domElement.addEventListener('pointerup', handlePointerUp);

    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    let frameId = 0;
    let disposed = false;
    let lastTime = performance.now();
    let lastTelemetryPush = 0;

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      if (!gl || !gl.fenceSync) {
        frameId = window.setTimeout(cb, 80);
        return;
      }
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) {
          if (sync) gl.deleteSync(sync);
          return;
        }
        const status = sync ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.SIGNALED;
        if (status === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function projectCallouts(viewportW: number, viewportH: number) {
      if (!stateRef.current.showLabels) return;
      for (const part of MOTOR_PARTS) {
        const el = labelRefs.current[part.id];
        const anchor = motor.partAnchors[part.id];
        if (!el || !anchor) continue;

        anchor.getWorldPosition(_projVec);
        _projVec.project(camera);

        const isBehind = _projVec.z > 1 || _projVec.z < -1;
        if (isBehind) {
          el.style.opacity = '0';
          el.style.pointerEvents = 'none';
          continue;
        }

        const x = ((_projVec.x + 1) * 0.5) * viewportW;
        const y = ((-_projVec.y + 1) * 0.5) * viewportH;

        el.style.opacity = '1';
        el.style.pointerEvents = 'auto';
        el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -100%)`;
      }
    }

    function tick() {
      if (disposed) return;
      const now = performance.now();
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;

      const s = stateRef.current;

      if (s.isPlaying) {
        const scaledDt = dt * s.animSpeed;
        acPhaseRef.current += scaledDt * s.acVisualHz * Math.PI * 2;
        if (s.voltageRms > 1) {
          const omegaRotor = (s.voltageRms / 220) * 3.9 * s.fieldDirection;
          rotorAngleRef.current += omegaRotor * scaledDt;
        }
      }

      const camTrans = cameraTransitionRef.current;
      if (camTrans.active) {
        _targetCamPos.set(...camTrans.position);
        _targetCtrlPos.set(...camTrans.target);
        const lambda = 5.5;
        camera.position.x = THREE.MathUtils.damp(camera.position.x, _targetCamPos.x, lambda, dt);
        camera.position.y = THREE.MathUtils.damp(camera.position.y, _targetCamPos.y, lambda, dt);
        camera.position.z = THREE.MathUtils.damp(camera.position.z, _targetCamPos.z, lambda, dt);
        controls.target.x = THREE.MathUtils.damp(controls.target.x, _targetCtrlPos.x, lambda, dt);
        controls.target.y = THREE.MathUtils.damp(controls.target.y, _targetCtrlPos.y, lambda, dt);
        controls.target.z = THREE.MathUtils.damp(controls.target.z, _targetCtrlPos.z, lambda, dt);

        if (
          camera.position.distanceTo(_targetCamPos) < 0.025 &&
          controls.target.distanceTo(_targetCtrlPos) < 0.025
        ) {
          camTrans.active = false;
        }
      }

      controls.update();

      const telemetry = motor.update(dt * s.animSpeed, rotorAngleRef.current, acPhaseRef.current, {
        voltageRms: s.voltageRms,
        phaseLagDeg: s.phaseLagDeg,
        phaseMode: s.phaseMode,
        coilCount: s.coilCount,
        fieldDirection: s.fieldDirection,
        explode: s.explode,
        showCurrent: s.showCurrent,
        showVectors: s.showVectors,
        selectedPart: s.selectedPart,
        hoveredPart: s.hoveredPart,
      });

      renderer.render(scene, camera);

      const cw = container?.clientWidth || window.innerWidth;
      const ch = container?.clientHeight || window.innerHeight;
      projectCallouts(cw, ch);

      if (forceTelemetrySyncRef.current || now - lastTelemetryPush > 40) {
        forceTelemetrySyncRef.current = false;
        lastTelemetryPush = now;
        callbacksRef.current.onTelemetryUpdate(telemetry);
      }

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    }

    if (isSoftwareGl) {
      frameId = window.setTimeout(tick, 16);
    } else {
      frameId = requestAnimationFrame(tick);
    }

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      window.removeEventListener('resize', handleResize);
      controls.removeEventListener('start', stopAutoCamera);
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
      renderer.domElement.removeEventListener('pointermove', handlePointerMove);
      renderer.domElement.removeEventListener('pointerup', handlePointerUp);
      renderer.domElement.removeEventListener('webglcontextlost', handleContextLost);
      renderer.domElement.removeEventListener('webglcontextrestored', handleContextRestored);
      controls.dispose();
      motor.dispose();
      envTarget.dispose();
      renderer.dispose();
      if (renderer.domElement.parentElement === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  if (webglError) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-slate-100 p-8">
        <div className="max-w-md bg-white border border-slate-200 rounded-xl p-6 text-center shadow-sm">
          <h2 className="font-display text-lg font-semibold text-slate-900 mb-2">
            Visualização 3D Indisponível
          </h2>
          <p className="text-sm text-slate-600">{webglError}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full overflow-hidden select-none">
      <div ref={mountRef} className="w-full h-full" />

      {showLabels && (
        <div className="pointer-events-none fixed inset-0 z-10 overflow-hidden">
          {MOTOR_PARTS.map((part) => {
            const isSelected = selectedPart === part.id;
            const isHovered = hoveredPart === part.id;
            return (
              <button
                key={part.id}
                ref={(el) => {
                  labelRefs.current[part.id] = el;
                }}
                type="button"
                onClick={() => onSelectPart(isSelected ? null : part.id)}
                className={`group absolute top-0 left-0 flex flex-col items-center focus-visible:outline-2 focus-visible:outline-blue-600 transition-colors duration-150 ${
                  isSelected ? 'z-20' : 'z-10'
                }`}
                style={{ opacity: 0 }}
                aria-label={`Inspecionar ${part.name}`}
              >
                <span
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap shadow-sm border transition-all duration-150 ${
                    isSelected
                      ? 'bg-slate-900 text-white border-slate-900'
                      : isHovered
                      ? 'bg-blue-50 text-blue-900 border-blue-300'
                      : 'bg-white/95 text-slate-800 border-slate-200 hover:border-slate-400'
                  }`}
                >
                  <span
                    className={`font-mono-tabular text-[11px] font-semibold ${
                      isSelected ? 'text-blue-300' : 'text-slate-400'
                    }`}
                  >
                    {part.index}
                  </span>
                  <span>{part.shortLabel}</span>
                </span>
                <span
                  className={`w-px h-3 ${isSelected ? 'bg-slate-900' : 'bg-slate-400/80'}`}
                />
                <span
                  className={`w-2 h-2 rounded-full border ${
                    isSelected ? 'bg-blue-500 border-white' : 'bg-white border-slate-500'
                  }`}
                />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
