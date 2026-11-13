import React, { useEffect, useRef, useState } from 'react';
import { Activity, ChevronDown, ChevronUp } from 'lucide-react';
import { PhaseMode } from '../data/motorParts';
import { MotorLiveTelemetry } from '../three/motorModel';

interface OscilloscopePanelProps {
  telemetry: MotorLiveTelemetry;
  voltageRms: number;
  phaseLagDeg: number;
  phaseMode: PhaseMode;
  onChangePhaseLag: (deg: number) => void;
  visible: boolean;
}

const PHASE_TITLE: Record<PhaseMode, string> = {
  monofasico: '1Φ Monofásico',
  bifasico: '2Φ Bifásico',
  trifasico: '3Φ Trifásico',
};

export const OscilloscopePanel: React.FC<OscilloscopePanelProps> = ({
  telemetry,
  voltageRms,
  phaseLagDeg,
  phaseMode,
  onChangePhaseLag,
  visible,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [minimized, setMinimized] = useState(false);
  const [showV, setShowV] = useState(true);
  const [showI, setShowI] = useState(true);

  useEffect(() => {
    if (!visible || minimized) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = 292;
    const height = 134;
    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.save();
    ctx.scale(dpr, dpr);

    // 1. Oscilloscope screen background
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, width, height);

    // 2. Calibrated graticule grid
    const cols = 8;
    const rows = 4;
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.14)';
    ctx.lineWidth = 1;
    for (let c = 1; c < cols; c++) {
      const gx = (c / cols) * width;
      ctx.beginPath();
      ctx.moveTo(gx, 0);
      ctx.lineTo(gx, height);
      ctx.stroke();
    }
    for (let r = 1; r < rows; r++) {
      const gy = (r / rows) * height;
      ctx.beginPath();
      ctx.moveTo(0, gy);
      ctx.lineTo(width, gy);
      ctx.stroke();
    }

    // Center Neutral (0 V) baseline
    const midY = height * 0.5;
    ctx.strokeStyle = 'rgba(147, 197, 253, 0.5)';
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.moveTo(0, midY);
    ctx.lineTo(width, midY);
    ctx.stroke();

    // Live time marker at x = 80% (t = agora)
    const nowX = width * 0.8;
    ctx.strokeStyle = 'rgba(226, 232, 240, 0.28)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(nowX, 4);
    ctx.lineTo(nowX, height - 4);
    ctx.stroke();
    ctx.setLineDash([]);

    const ampScale = (voltageRms / 220) * (height * 0.37);
    const phaseLagRad = (phaseLagDeg * Math.PI) / 180;
    const totalSpanRad = Math.PI * 4; // 2 full AC cycles across screen
    const phaseAtLeft = telemetry.acPhaseRad - 0.8 * totalSpanRad;

    const drawWaveform = (
      color: string,
      phaseShiftRad: number,
      isCurrent: boolean,
      alphaMax: number,
      lineWidth = 1.9
    ) => {
      const steps = 160;
      ctx.lineWidth = lineWidth;
      ctx.strokeStyle = color;
      ctx.globalAlpha = alphaMax;
      ctx.beginPath();

      const rippleScale =
        telemetry.commutatorBarsCount <= 2
          ? 0.82
          : 1 - Math.max(0.02, 0.14 / Math.sqrt(telemetry.commutatorBarsCount / 2));

      for (let i = 0; i <= steps; i++) {
        const px = (i / steps) * nowX;
        const theta = phaseAtLeft + (px / width) * totalSpanRad;
        let val = Math.sin(theta - phaseShiftRad);
        if (isCurrent && telemetry.isCommutating && i > steps - 4 && voltageRms > 5) {
          val *= rippleScale;
        }
        const py = midY - val * ampScale;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();

      // Subtle preview curve right of cursor
      ctx.globalAlpha = 0.24;
      ctx.beginPath();
      for (let i = 0; i <= 40; i++) {
        const px = nowX + (i / 40) * (width - nowX);
        const theta = phaseAtLeft + (px / width) * totalSpanRad;
        const val = Math.sin(theta - phaseShiftRad);
        const py = midY - val * ampScale;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;

      // Instantaneous trace head dot at nowX
      const nowVal =
        Math.sin(telemetry.acPhaseRad - phaseShiftRad) *
        (isCurrent && telemetry.isCommutating && voltageRms > 5 ? rippleScale : 1);
      const dotY = midY - nowVal * ampScale;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(nowX, dotY, 3.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 1.1;
      ctx.stroke();
    };

    if (showV) {
      if (phaseMode === 'monofasico') {
        drawWaveform('#38bdf8', 0, false, 0.95, 2.0);
      } else if (phaseMode === 'bifasico') {
        drawWaveform('#c084fc', Math.PI / 2, false, 0.9, 1.8);
        drawWaveform('#38bdf8', 0, false, 0.95, 2.0);
      } else {
        drawWaveform('#fb7185', (4 * Math.PI) / 3, false, 0.88, 1.75);
        drawWaveform('#34d399', (2 * Math.PI) / 3, false, 0.88, 1.75);
        drawWaveform('#38bdf8', 0, false, 0.95, 2.0);
      }
    }
    if (showI) {
      drawWaveform('#f59e0b', phaseLagRad, true, 0.95, 1.85);
    }

    // Explicit Neutral (0 V) tag on the center line + graticule corner labels
    ctx.font = '600 9px "IBM Plex Mono", monospace';
    ctx.fillStyle = 'rgba(147, 197, 253, 0.95)';
    ctx.fillText('Neutro (0 V)', 6, midY - 4);

    ctx.font = '500 9px "IBM Plex Mono", monospace';
    ctx.fillStyle = 'rgba(203, 213, 225, 0.78)';
    ctx.fillText('60 Hz · 2 ciclos', 6, 12);
    ctx.fillText('Agora', nowX - 14, 12);

    ctx.restore();
  }, [telemetry, voltageRms, phaseLagDeg, phaseMode, showV, showI, visible, minimized]);

  if (!visible) return null;

  return (
    <section
      aria-label="Osciloscópio de tensão e corrente alternada"
      className="fixed top-[122px] left-5 z-20 w-[320px] max-w-[calc(100vw-2.5rem)] bg-white/95 border border-slate-200 rounded-2xl shadow-lg overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-slate-100">
        <div className="flex items-center gap-1.5 min-w-0">
          <Activity className="w-4 h-4 text-sky-600 shrink-0" />
          <span className="font-display text-xs font-semibold text-slate-900 truncate">
            Osciloscópio CA
          </span>
          <span className="text-[11px] text-slate-400">·</span>
          <span className="font-mono-tabular text-[11px] font-medium text-blue-700 whitespace-nowrap">
            {PHASE_TITLE[phaseMode]}
          </span>
        </div>

        <button
          type="button"
          onClick={() => setMinimized((m) => !m)}
          aria-label={minimized ? 'Expandir osciloscópio' : 'Minimizar osciloscópio'}
          className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
        >
          {minimized ? (
            <ChevronUp className="w-3.5 h-3.5" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5" />
          )}
        </button>
      </div>

      {!minimized && (
        <div className="p-3 space-y-2.5">
          {/* Canvas Screen */}
          <div className="rounded-xl overflow-hidden border border-slate-800/80">
            <canvas
              ref={canvasRef}
              className="block w-[292px] h-[134px]"
              style={{ width: '100%', height: '134px' }}
            />
          </div>

          {/* Live Phase Voltages & Current Channel Toggles */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setShowV((v) => !v)}
              className={`text-left px-2.5 py-1.5 rounded-xl border transition-colors cursor-pointer ${
                showV
                  ? 'bg-sky-50/80 border-sky-200'
                  : 'bg-slate-50 border-slate-200 opacity-60'
              }`}
            >
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-600">
                <span className="w-2.5 h-0.5 bg-sky-500 inline-block" />
                <span>
                  {phaseMode === 'trifasico'
                    ? 'Tensões R / S / T'
                    : phaseMode === 'bifasico'
                    ? 'Fases F1 / F2 (90°)'
                    : 'CH1 Tensão F1'}
                </span>
              </div>
              <div className="font-mono-tabular text-[11px] font-semibold text-slate-900 mt-0.5 leading-tight">
                {phaseMode === 'monofasico' && (
                  <span>
                    {telemetry.v1Volts >= 0 ? '+' : ''}
                    {telemetry.v1Volts.toFixed(0)} V
                  </span>
                )}
                {phaseMode === 'bifasico' && (
                  <span>
                    {telemetry.v1Volts >= 0 ? '+' : ''}
                    {telemetry.v1Volts.toFixed(0)}V /{' '}
                    <span className="text-purple-700">
                      {telemetry.v2Volts >= 0 ? '+' : ''}
                      {telemetry.v2Volts.toFixed(0)}V
                    </span>
                  </span>
                )}
                {phaseMode === 'trifasico' && (
                  <span className="text-[10.5px]">
                    {telemetry.v1Volts.toFixed(0)} /{' '}
                    <span className="text-emerald-700">{telemetry.v2Volts.toFixed(0)}</span> /{' '}
                    <span className="text-rose-600">{telemetry.v3Volts.toFixed(0)}V</span>
                  </span>
                )}
              </div>
            </button>

            <button
              type="button"
              onClick={() => setShowI((i) => !i)}
              className={`text-left px-2.5 py-1.5 rounded-xl border transition-colors cursor-pointer ${
                showI
                  ? 'bg-amber-50/80 border-amber-200'
                  : 'bg-slate-50 border-slate-200 opacity-60'
              }`}
            >
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-600">
                <span className="w-2.5 h-0.5 bg-amber-500 inline-block" />
                <span>CH2 Corrente i₁(t)</span>
              </div>
              <div className="font-mono-tabular text-xs font-semibold text-slate-900 mt-0.5">
                {telemetry.i1Amps >= 0 ? '+' : ''}
                {telemetry.i1Amps.toFixed(1)} A
              </div>
            </button>
          </div>

          {/* Neutral Reference & Phase Legend */}
          <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-blue-50/70 border border-blue-200/80 text-[11px]">
            <div className="flex items-center gap-1.5 font-medium text-blue-900">
              <span className="w-2 h-2 rounded-full bg-blue-600 inline-block" />
              <span>Referência Neutro (N)</span>
            </div>
            <span className="font-mono-tabular font-semibold text-blue-800">
              {telemetry.neutralVolts.toFixed(1)} V (ref.)
            </span>
          </div>

          {/* Inductive Phase Lag Slider + Live Stator Field / Poles */}
          <div className="pt-1 border-t border-slate-100 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor="phase-lag-slider"
                className="text-[11px] font-medium text-slate-600 whitespace-nowrap"
              >
                Defasagem Indutiva (φ)
              </label>
              <span className="font-mono-tabular text-[11px] font-semibold text-slate-900">
                {phaseLagDeg}°
              </span>
            </div>
            <input
              id="phase-lag-slider"
              type="range"
              min={0}
              max={45}
              step={1}
              value={phaseLagDeg}
              onChange={(e) => onChangePhaseLag(parseInt(e.target.value, 10))}
              className="studio-slider w-full"
            />
            <div className="flex items-center justify-between text-[11px] text-slate-500 pt-0.5">
              <span>{phaseMode === 'monofasico' ? 'Polos do Estator' : 'Campo Girante B(t)'}</span>
              <span className="font-mono-tabular font-semibold text-slate-800">
                {phaseMode === 'monofasico'
                  ? `Esq: ${telemetry.leftPole} · Dir: ${telemetry.rightPole}`
                  : `θ = ${telemetry.fieldAngleDeg.toFixed(0)}°`}
              </span>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
