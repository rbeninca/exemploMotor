/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useState } from 'react';
import { ControlDock } from './components/ControlDock';
import { CameraTargetState, MotorViewport } from './components/MotorViewport';
import { OscilloscopePanel } from './components/OscilloscopePanel';
import { TechnicalLegendDrawer } from './components/TechnicalLegendDrawer';
import {
  CAMERA_PRESETS,
  CameraPresetId,
  MOTOR_PARTS,
  MotorPartId,
  PhaseMode,
} from './data/motorParts';
import { MotorLiveTelemetry } from './three/motorModel';

const INITIAL_TELEMETRY: MotorLiveTelemetry = {
  angleDeg: 0,
  rpm: 1385,
  acPhaseRad: 0.55,
  phaseMode: 'monofasico',
  v1Volts: 94,
  v2Volts: 0,
  v3Volts: 0,
  i1Amps: 1.5,
  iNorm: 0.1,
  neutralVolts: 0,
  fieldAngleDeg: 0,
  leftPole: 'N',
  rightPole: 'S',
  isCommutating: false,
  activeSegmentAtPositiveBrush: 'B',
  torqueNormalized: 0.4,
  commutatorBarsCount: 2,
};

export default function App() {
  const [isPlaying, setIsPlaying] = useState(true);
  const [stepPulse, setStepPulse] = useState(0);
  const [voltageRms, setVoltageRms] = useState(127);
  const [phaseLagDeg, setPhaseLagDeg] = useState(24);
  const [phaseMode, setPhaseMode] = useState<PhaseMode>('monofasico');
  const [coilCount, setCoilCount] = useState(1);
  const [animSpeed, setAnimSpeed] = useState(1.0);
  const [fieldDirection, setFieldDirection] = useState<1 | -1>(1);
  const [explode, setExplode] = useState(0);

  const [showLabels, setShowLabels] = useState(true);
  const [showCurrent, setShowCurrent] = useState(true);
  const [showVectors, setShowVectors] = useState(true);
  const [showScope, setShowScope] = useState(true);
  const [dockCollapsed, setDockCollapsed] = useState(false);

  const [selectedPart, setSelectedPart] = useState<MotorPartId | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeCamera, setActiveCamera] = useState<CameraPresetId | null>('geral');
  const [cameraRequest, setCameraRequest] = useState<CameraTargetState>(() => ({
    position: CAMERA_PRESETS.geral.position,
    target: CAMERA_PRESETS.geral.target,
    nonce: 0,
  }));

  const [telemetry, setTelemetry] = useState<MotorLiveTelemetry>(INITIAL_TELEMETRY);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }
      if (e.key === 'h' || e.key === 'H') {
        setDockCollapsed((prev) => !prev);
      } else if (e.key === ' ') {
        e.preventDefault();
        setIsPlaying((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const handleSelectPart = useCallback((partId: MotorPartId | null) => {
    setSelectedPart(partId);
    if (partId) {
      setDrawerOpen(true);
      setActiveCamera(null);
      const part = MOTOR_PARTS.find((p) => p.id === partId);
      if (part) {
        setCameraRequest((prev) => ({
          position: part.cameraPosition,
          target: part.cameraTarget,
          nonce: prev.nonce + 1,
        }));
      }
    }
  }, []);

  const handleSelectCamera = useCallback((preset: CameraPresetId) => {
    setActiveCamera(preset);
    const cfg = CAMERA_PRESETS[preset];
    setCameraRequest((prev) => ({
      position: cfg.position,
      target: cfg.target,
      nonce: prev.nonce + 1,
    }));
  }, []);

  const handleStepAngle = useCallback(() => {
    setIsPlaying(false);
    setStepPulse((n) => n + 1);
  }, []);

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-[#f4f6f9]">
      {/* Full-Viewport 3D Interactive AC Motor Stage */}
      <MotorViewport
        isPlaying={isPlaying}
        stepPulse={stepPulse}
        voltageRms={voltageRms}
        phaseLagDeg={phaseLagDeg}
        phaseMode={phaseMode}
        coilCount={coilCount}
        animSpeed={animSpeed}
        acVisualHz={0.42}
        fieldDirection={fieldDirection}
        explode={explode}
        showCurrent={showCurrent}
        showVectors={showVectors}
        showLabels={showLabels}
        selectedPart={selectedPart}
        cameraRequest={cameraRequest}
        onSelectPart={handleSelectPart}
        onTelemetryUpdate={setTelemetry}
      />

      {/* Minimal Top-Left Header & Unboxed Physics Legend */}
      <header className="pointer-events-none fixed top-5 left-5 z-20 max-w-md">
        <div className="pointer-events-auto inline-block">
          <h1 className="font-display text-lg sm:text-xl font-bold tracking-tight text-slate-900">
            Motor Elétrico CA
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
            Estator Bobinado (1Φ / 2Φ / 3Φ), Induzido e Escovas
          </p>
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-500 mt-1">
            <span>Arraste para orbitar</span>
            <span aria-hidden="true">·</span>
            <span>Clique nas peças ou legendas</span>
          </div>

          {(showCurrent || showVectors) && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-medium text-slate-600 mt-1.5">
              {showVectors && (
                <>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-0.5 bg-sky-600 inline-block" />
                    Campo B(t)
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-0.5 bg-emerald-600 inline-block" />
                    Força F
                  </span>
                </>
              )}
              {showCurrent && (
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
                  Corrente i(t)
                </span>
              )}
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-blue-600 inline-block" />
                Neutro (0 V)
              </span>
            </div>
          )}
        </div>
      </header>

      {/* Live Multi-Phase AC Oscilloscope */}
      <OscilloscopePanel
        telemetry={telemetry}
        voltageRms={voltageRms}
        phaseLagDeg={phaseLagDeg}
        phaseMode={phaseMode}
        onChangePhaseLag={setPhaseLagDeg}
        visible={showScope}
      />

      {/* Top-Right Interactive Technical Legend Drawer */}
      <TechnicalLegendDrawer
        selectedPart={selectedPart}
        isOpen={drawerOpen}
        telemetry={telemetry}
        onSelectPart={handleSelectPart}
        onToggleOpen={setDrawerOpen}
        onClosePart={() => setSelectedPart(null)}
      />

      {/* Bottom-Center Collapsible Control Dock */}
      <ControlDock
        collapsed={dockCollapsed}
        onToggleCollapse={() => setDockCollapsed((c) => !c)}
        isPlaying={isPlaying}
        onTogglePlay={() => setIsPlaying((p) => !p)}
        onStepAngle={handleStepAngle}
        voltageRms={voltageRms}
        rpm={telemetry.rpm}
        onChangeVoltageRms={setVoltageRms}
        phaseMode={phaseMode}
        onChangePhaseMode={setPhaseMode}
        coilCount={coilCount}
        onChangeCoilCount={setCoilCount}
        animSpeed={animSpeed}
        onChangeAnimSpeed={setAnimSpeed}
        fieldDirection={fieldDirection}
        onToggleFieldDirection={() => setFieldDirection((d) => (d === 1 ? -1 : 1))}
        explode={explode}
        onChangeExplode={setExplode}
        activeCamera={activeCamera}
        onSelectCamera={handleSelectCamera}
        showLabels={showLabels}
        onToggleLabels={() => setShowLabels((v) => !v)}
        showCurrent={showCurrent}
        onToggleCurrent={() => setShowCurrent((v) => !v)}
        showVectors={showVectors}
        onToggleVectors={() => setShowVectors((v) => !v)}
        showScope={showScope}
        onToggleScope={() => setShowScope((v) => !v)}
      />
    </main>
  );
}
