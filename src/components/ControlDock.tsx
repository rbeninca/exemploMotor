import React from 'react';
import {
  ChevronDown,
  ChevronUp,
  Play,
  Pause,
  StepForward,
  ArrowLeftRight,
  Tag,
  Zap,
  Compass,
  Activity,
} from 'lucide-react';
import { CAMERA_PRESETS, CameraPresetId, PhaseMode } from '../data/motorParts';

const PHASE_OPTIONS: { id: PhaseMode; label: string }[] = [
  { id: 'monofasico', label: '1Φ Monofásico' },
  { id: 'bifasico', label: '2Φ Bifásico' },
  { id: 'trifasico', label: '3Φ Trifásico' },
];

interface ControlDockProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onStepAngle: () => void;
  voltageRms: number;
  rpm: number;
  onChangeVoltageRms: (v: number) => void;
  phaseMode: PhaseMode;
  onChangePhaseMode: (mode: PhaseMode) => void;
  coilCount: number;
  onChangeCoilCount: (n: number) => void;
  animSpeed: number;
  onChangeAnimSpeed: (s: number) => void;
  fieldDirection: 1 | -1;
  onToggleFieldDirection: () => void;
  explode: number;
  onChangeExplode: (val: number) => void;
  activeCamera: CameraPresetId | null;
  onSelectCamera: (preset: CameraPresetId) => void;
  showLabels: boolean;
  onToggleLabels: () => void;
  showCurrent: boolean;
  onToggleCurrent: () => void;
  showVectors: boolean;
  onToggleVectors: () => void;
  showScope: boolean;
  onToggleScope: () => void;
}

export const ControlDock: React.FC<ControlDockProps> = ({
  collapsed,
  onToggleCollapse,
  isPlaying,
  onTogglePlay,
  onStepAngle,
  voltageRms,
  rpm,
  onChangeVoltageRms,
  phaseMode,
  onChangePhaseMode,
  coilCount,
  onChangeCoilCount,
  animSpeed,
  onChangeAnimSpeed,
  fieldDirection,
  onToggleFieldDirection,
  explode,
  onChangeExplode,
  activeCamera,
  onSelectCamera,
  showLabels,
  onToggleLabels,
  showCurrent,
  onToggleCurrent,
  showVectors,
  onToggleVectors,
  showScope,
  onToggleScope,
}) => {
  return (
    <div
      className="fixed bottom-5 left-1/2 z-30 flex flex-col items-center transition-transform duration-300 ease-out"
      style={{
        transform: collapsed
          ? 'translate(-50%, calc(100% - 36px))'
          : 'translate(-50%, 0)',
        width: 'min(1140px, 96vw)',
      }}
    >
      <button
        type="button"
        onClick={onToggleCollapse}
        title="Atalho: tecla H"
        className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-t-xl bg-white/95 border border-b-0 border-slate-200 text-xs font-medium text-slate-600 hover:text-slate-900 shadow-sm whitespace-nowrap shrink-0 cursor-pointer"
      >
        {collapsed ? (
          <>
            <ChevronUp className="w-3.5 h-3.5" />
            <span>Mostrar Controles</span>
          </>
        ) : (
          <>
            <ChevronDown className="w-3.5 h-3.5" />
            <span>Ocultar Controles</span>
          </>
        )}
      </button>

      <div className="w-full bg-white/95 border border-slate-200 rounded-2xl shadow-lg px-4 py-3 flex flex-col gap-3">
        {/* Row 1: 4 Seekbars in clean responsive grid (label + value above each track, zero overlap) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-5 gap-y-2.5">
          {/* AC Voltage RMS Slider */}
          <div className="flex flex-col gap-1.5 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor="voltage-slider"
                className="text-xs font-medium text-slate-600 whitespace-nowrap"
              >
                Tensão CA
              </label>
              <span className="font-mono-tabular text-xs font-semibold text-slate-900 whitespace-nowrap">
                {voltageRms.toFixed(0)} V · {rpm} rpm
              </span>
            </div>
            <input
              id="voltage-slider"
              type="range"
              min={0}
              max={220}
              step={5}
              value={voltageRms}
              onChange={(e) => onChangeVoltageRms(parseFloat(e.target.value))}
              className="studio-slider w-full min-w-0"
            />
          </div>

          {/* Animation Speed Slider (allows ultra-slow 0.02x inspection up to 2.50x) */}
          <div className="flex flex-col gap-1.5 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor="speed-slider"
                className="text-xs font-medium text-slate-600 whitespace-nowrap"
              >
                Vel. Animação
              </label>
              <span className="font-mono-tabular text-xs font-semibold text-slate-900 whitespace-nowrap">
                {animSpeed.toFixed(2)}×
              </span>
            </div>
            <input
              id="speed-slider"
              type="range"
              min={0.02}
              max={2.5}
              step={0.02}
              value={animSpeed}
              onChange={(e) => onChangeAnimSpeed(parseFloat(e.target.value))}
              className="studio-slider w-full min-w-0"
            />
          </div>

          {/* Armature Coil Count Slider (1 Monophasic up to 24 coils) */}
          <div className="flex flex-col gap-1.5 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor="coils-slider"
                className="text-xs font-medium text-slate-600 whitespace-nowrap"
              >
                Bobinas
              </label>
              <span className="font-mono-tabular text-xs font-semibold text-slate-900 whitespace-nowrap">
                {coilCount === 1 ? '1 (Monofásico)' : `${coilCount} bobinas`}
              </span>
            </div>
            <input
              id="coils-slider"
              type="range"
              min={1}
              max={24}
              step={1}
              value={coilCount}
              onChange={(e) => onChangeCoilCount(parseInt(e.target.value, 10))}
              className="studio-slider w-full min-w-0"
            />
          </div>

          {/* Exploded View Slider */}
          <div className="flex flex-col gap-1.5 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor="explode-slider"
                className="text-xs font-medium text-slate-600 whitespace-nowrap"
              >
                Vista Explodida
              </label>
              <span className="font-mono-tabular text-xs font-semibold text-slate-900 whitespace-nowrap">
                {Math.round(explode * 100)}%
              </span>
            </div>
            <input
              id="explode-slider"
              type="range"
              min={0}
              max={1}
              step={0.02}
              value={explode}
              onChange={(e) => onChangeExplode(parseFloat(e.target.value))}
              className="studio-slider w-full min-w-0"
            />
          </div>
        </div>

        <div className="h-px w-full bg-slate-100" />

        {/* Row 2: Playback Actions + Camera Presets + Visual Layer Toggles */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* Playback & Field Reversal */}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={onTogglePlay}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 text-white text-xs font-medium hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {isPlaying ? (
                <>
                  <Pause className="w-3.5 h-3.5" />
                  <span>Pausar</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5" />
                  <span>Reproduzir</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={onStepAngle}
              title="Avançar ciclo CA e rotor passo a passo"
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <StepForward className="w-3.5 h-3.5" />
              <span>Passo +15°</span>
            </button>

            <button
              type="button"
              onClick={onToggleFieldDirection}
              title="Inverter ligação das bobinas do estator para reverter o sentido de giro"
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                fieldDirection === 1
                  ? 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  : 'border-blue-200 bg-blue-50 text-blue-900 hover:bg-blue-100'
              }`}
            >
              <ArrowLeftRight className="w-3.5 h-3.5" />
              <span>{fieldDirection === 1 ? 'Campo: Direto' : 'Campo: Invertido'}</span>
            </button>
          </div>

          {/* Phase Mode Switcher (1Φ / 2Φ / 3Φ) */}
          <div
            role="group"
            aria-label="Sistema de fases do motor"
            className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl"
          >
            {PHASE_OPTIONS.map((opt) => {
              const isActive = phaseMode === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onChangePhaseMode(opt.id)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          {/* Camera Presets */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl overflow-x-auto">
            {(Object.keys(CAMERA_PRESETS) as CameraPresetId[]).map((presetKey) => {
              const isActive = activeCamera === presetKey;
              return (
                <button
                  key={presetKey}
                  type="button"
                  onClick={() => onSelectCamera(presetKey)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    isActive
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {CAMERA_PRESETS[presetKey].label}
                </button>
              );
            })}
          </div>

          {/* Layer Toggles */}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={onToggleScope}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                showScope
                  ? 'border-sky-600 bg-sky-50 text-sky-900'
                  : 'border-slate-200 bg-white text-slate-600 hover:text-slate-900'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              <span>Osciloscópio</span>
            </button>

            <button
              type="button"
              onClick={onToggleLabels}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                showLabels
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-slate-200 bg-white text-slate-600 hover:text-slate-900'
              }`}
            >
              <Tag className="w-3.5 h-3.5" />
              <span>Legendas 3D</span>
            </button>

            <button
              type="button"
              onClick={onToggleCurrent}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                showCurrent
                  ? 'border-amber-600 bg-amber-50 text-amber-900'
                  : 'border-slate-200 bg-white text-slate-600 hover:text-slate-900'
              }`}
            >
              <Zap className="w-3.5 h-3.5" />
              <span>Corrente CA</span>
            </button>

            <button
              type="button"
              onClick={onToggleVectors}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                showVectors
                  ? 'border-emerald-600 bg-emerald-50 text-emerald-900'
                  : 'border-slate-200 bg-white text-slate-600 hover:text-slate-900'
              }`}
            >
              <Compass className="w-3.5 h-3.5" />
              <span>Vetores B e F</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
