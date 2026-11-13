import React from 'react';
import { ChevronLeft, ChevronRight, X, BookOpen } from 'lucide-react';
import { MOTOR_PARTS, MotorPartId } from '../data/motorParts';
import { MotorLiveTelemetry } from '../three/motorModel';

interface TechnicalLegendDrawerProps {
  selectedPart: MotorPartId | null;
  isOpen: boolean;
  telemetry: MotorLiveTelemetry;
  onSelectPart: (partId: MotorPartId) => void;
  onToggleOpen: (open: boolean) => void;
  onClosePart: () => void;
}

export const TechnicalLegendDrawer: React.FC<TechnicalLegendDrawerProps> = ({
  selectedPart,
  isOpen,
  telemetry,
  onSelectPart,
  onToggleOpen,
  onClosePart,
}) => {
  const activeIndex = selectedPart
    ? MOTOR_PARTS.findIndex((p) => p.id === selectedPart)
    : -1;
  const activePart = activeIndex >= 0 ? MOTOR_PARTS[activeIndex] : null;

  const handlePrev = () => {
    const nextIdx = activeIndex <= 0 ? MOTOR_PARTS.length - 1 : activeIndex - 1;
    onSelectPart(MOTOR_PARTS[nextIdx].id);
  };

  const handleNext = () => {
    const nextIdx = activeIndex >= MOTOR_PARTS.length - 1 ? 0 : activeIndex + 1;
    onSelectPart(MOTOR_PARTS[nextIdx].id);
  };

  const acCycleLabel =
    telemetry.phaseMode === 'trifasico'
      ? `Trifásico 3Φ · B(t) ${telemetry.fieldAngleDeg.toFixed(0)}°`
      : telemetry.phaseMode === 'bifasico'
      ? `Bifásico 2Φ · B(t) ${telemetry.fieldAngleDeg.toFixed(0)}°`
      : Math.abs(telemetry.iNorm) < 0.05
      ? 'Cruzamento por Zero (Neutro)'
      : telemetry.iNorm >= 0
      ? 'Semiciclo Positivo (+)'
      : 'Semiciclo Negativo (−)';

  if (!isOpen && !activePart) {
    return (
      <div className="fixed top-5 right-5 z-20">
        <button
          type="button"
          onClick={() => onToggleOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/95 border border-slate-200 shadow-sm text-sm font-medium text-slate-800 hover:bg-slate-50 hover:border-slate-300 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <BookOpen className="w-4 h-4 text-blue-600" />
          <span>Legendas Técnicas</span>
        </button>
      </div>
    );
  }

  return (
    <aside
      aria-label="Legendas técnicas interativas"
      className="fixed top-5 right-5 z-20 w-[340px] max-w-[calc(100vw-2.5rem)] max-h-[calc(100vh-140px)] flex flex-col bg-white/95 border border-slate-200 rounded-2xl shadow-lg overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className="font-mono-tabular font-medium text-blue-700">
              {activePart ? activePart.index : 'Índice'}
            </span>
            <span aria-hidden="true">·</span>
            <span>{activePart ? activePart.category : `${MOTOR_PARTS.length} Componentes`}</span>
          </div>
          <h2 className="font-display text-base font-semibold text-slate-900 truncate">
            {activePart ? activePart.name : 'Legendas Técnicas'}
          </h2>
        </div>

        <button
          type="button"
          onClick={() => {
            onClosePart();
            onToggleOpen(false);
          }}
          aria-label="Fechar painel técnico"
          className="p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors shrink-0 cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Live AC, Neutral & Commutation Readout */}
      <div className="px-4 py-2.5 bg-slate-50/90 border-b border-slate-100 grid grid-cols-3 gap-x-2 gap-y-1.5 text-xs">
        <div>
          <span className="text-slate-500 block">Rotor</span>
          <span className="font-mono-tabular font-semibold text-slate-900">
            {telemetry.angleDeg.toFixed(0)}°
          </span>
        </div>
        <div>
          <span className="text-slate-500 block">Neutro (N)</span>
          <span className="font-mono-tabular font-semibold text-blue-700">
            {telemetry.neutralVolts.toFixed(1)} V
          </span>
        </div>
        <div>
          <span className="text-slate-500 block">Comutador</span>
          <span
            className={`font-mono-tabular font-semibold ${
              telemetry.isCommutating ? 'text-amber-700' : 'text-slate-900'
            }`}
          >
            {telemetry.activeSegmentAtPositiveBrush === 'Fenda Isolante'
              ? 'Zona Neutra'
              : telemetry.commutatorBarsCount === 2
              ? `Lâmina ${telemetry.activeSegmentAtPositiveBrush}`
              : telemetry.activeSegmentAtPositiveBrush}
          </span>
        </div>
        <div className="col-span-3 pt-1 flex items-center justify-between border-t border-slate-200/70">
          <span className="text-slate-500">Estado da Rede CA</span>
          <span
            className={`font-medium ${
              telemetry.phaseMode !== 'monofasico'
                ? 'text-blue-700'
                : Math.abs(telemetry.iNorm) < 0.05
                ? 'text-slate-600'
                : telemetry.iNorm >= 0
                ? 'text-red-700'
                : 'text-blue-700'
            }`}
          >
            {acCycleLabel}
          </span>
        </div>
      </div>

      {/* Body */}
      <div className="overflow-y-auto px-4 py-3.5 space-y-3.5 text-sm">
        {activePart ? (
          <>
            <p className="text-slate-700 leading-relaxed">{activePart.summary}</p>

            <div className="space-y-2.5 pt-1 border-t border-slate-100">
              <div>
                <h3 className="text-xs font-semibold text-slate-900 mb-0.5">
                  Função no Motor CA
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  {activePart.functionText}
                </p>
              </div>
              <div>
                <h3 className="text-xs font-semibold text-slate-900 mb-0.5">
                  Construção e Material
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  {activePart.materialText}
                </p>
              </div>
              <div>
                <h3 className="text-xs font-semibold text-slate-900 mb-0.5">
                  Comportamento em Corrente Alternada
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  {activePart.acBehaviorNote}
                </p>
              </div>
            </div>
          </>
        ) : (
          <div className="space-y-1">
            <p className="text-xs text-slate-500 mb-2">
              Selecione um componente abaixo ou clique diretamente no modelo 3D para focar e inspecionar.
            </p>
            {MOTOR_PARTS.map((part) => (
              <button
                key={part.id}
                type="button"
                onClick={() => onSelectPart(part.id)}
                className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-slate-100/90 transition-colors flex items-start gap-2.5 cursor-pointer"
              >
                <span className="font-mono-tabular text-xs font-semibold text-blue-700 pt-0.5 shrink-0">
                  {part.index}
                </span>
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-slate-900">
                    {part.name}
                  </div>
                  <div className="text-xs text-slate-500 line-clamp-2 mt-0.5">
                    {part.summary}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Footer Navigation */}
      {activePart && (
        <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50/70 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onClosePart}
            className="text-xs font-medium text-slate-600 hover:text-slate-900 px-2 py-1.5 rounded-lg hover:bg-slate-200/60 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Todos os Itens
          </button>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handlePrev}
              aria-label="Componente anterior"
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Anterior</span>
            </button>
            <button
              type="button"
              onClick={handleNext}
              aria-label="Próximo componente"
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <span>Próximo</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </aside>
  );
};
