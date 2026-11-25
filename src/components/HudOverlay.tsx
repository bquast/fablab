import { GATE_SPECS, POC_STAGES } from '../game/stages';
import {
  ChipStage,
  GateType,
  SimulationReport,
} from '../game/types';

interface HudOverlayProps {
  stage: ChipStage;
  highestUnlockedStage: number;
  simulation: SimulationReport;
  placedCount: number;
  selectedGate: GateType;
  activeVectorIndex: number;
  hoverCoord: { col: number; row: number } | null;
  dockCollapsed: boolean;
  muted: boolean;
  copilotOpen: boolean;
  spatialTabletopMode: boolean;
  onSelectStage: (index: number) => void;
  onSelectGate: (gate: GateType) => void;
  onQuickPlaceCenter: (gate: GateType) => void;
  onStepVector: () => void;
  onRunSignoff: () => void;
  onClearDie: () => void;
  onToggleDock: () => void;
  onToggleMute: () => void;
  onToggleCopilot: () => void;
  onOpenXRModal: () => void;
  onPause: () => void;
}

function GateMiniIcon({ type, accent }: { type: GateType; accent: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="w-5 h-5 shrink-0"
      aria-hidden="true"
    >
      <rect
        x="2"
        y="2"
        width="20"
        height="20"
        rx="4"
        fill="#0f172a"
        stroke={accent}
        strokeWidth="1.8"
      />
      {type === 'NOT' || type === 'BUF' ? (
        <>
          <path
            d="M7 7 L15 12 L7 17 Z"
            fill="none"
            stroke="#f8fafc"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          {type === 'NOT' && (
            <circle cx="17.2" cy="12" r="1.5" fill="none" stroke="#f8fafc" strokeWidth="1.5" />
          )}
        </>
      ) : type === 'AND2' || type === 'NAND2' ? (
        <>
          <path
            d="M7 7 H11.5 A5 5 0 0 1 11.5 17 H7 Z"
            fill="none"
            stroke="#f8fafc"
            strokeWidth="1.6"
          />
          {type === 'NAND2' && (
            <circle cx="18" cy="12" r="1.4" fill="none" stroke="#f8fafc" strokeWidth="1.4" />
          )}
        </>
      ) : (
        <>
          {type === 'XOR2' && (
            <path
              d="M5.5 7 Q8 12 5.5 17"
              fill="none"
              stroke="#f8fafc"
              strokeWidth="1.5"
            />
          )}
          <path
            d="M7.5 7 Q13.5 7 17.5 12 Q13.5 17 7.5 17 Q10 12 7.5 7 Z"
            fill="none"
            stroke="#f8fafc"
            strokeWidth="1.5"
          />
        </>
      )}
    </svg>
  );
}

export function HudOverlay({
  stage,
  highestUnlockedStage,
  simulation,
  placedCount,
  selectedGate,
  activeVectorIndex,
  hoverCoord,
  dockCollapsed,
  muted,
  copilotOpen,
  spatialTabletopMode,
  onSelectStage,
  onSelectGate,
  onQuickPlaceCenter,
  onStepVector,
  onRunSignoff,
  onClearDie,
  onToggleDock,
  onToggleMute,
  onToggleCopilot,
  onOpenXRModal,
  onPause,
}: HudOverlayProps) {
  const activeVec =
    simulation.vectors[activeVectorIndex % Math.max(1, simulation.vectors.length)];

  return (
    <div className="fixed inset-0 z-10 pointer-events-none select-none flex flex-col justify-between p-4 sm:p-5">
      {/* Top Perimeter Strip: Left PPA Telemetry Cluster + Right Compact Utility Square Buttons */}
      <div className="flex items-start justify-between gap-4">
        {/* Top-Left World-Matched Silicon Die Readout */}
        <div
          className="pointer-events-auto rounded-xl px-4 py-3 border border-slate-700/75 shadow-xl max-w-xl"
          style={{ backgroundColor: 'rgba(10, 15, 28, 0.92)' }}
        >
          {/* Exercise Selector Tabs */}
          <div className="flex items-center justify-between gap-4 pb-2 mb-2 border-b border-slate-800">
            <div className="flex items-center gap-1.5" role="tablist" aria-label="PoC Exercises">
              {POC_STAGES.map((s) => {
                const locked = s.index > highestUnlockedStage;
                const active = s.index === stage.index;
                return (
                  <button
                    key={s.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    disabled={locked}
                    onClick={(e) => {
                      e.currentTarget.blur();
                      onSelectStage(s.index);
                    }}
                    className={`px-2.5 py-1 rounded text-xs font-mono font-medium transition-colors whitespace-nowrap shrink-0 ${
                      active
                        ? 'bg-amber-500 text-slate-950 font-semibold cursor-pointer'
                        : locked
                          ? 'text-slate-600 cursor-not-allowed'
                          : 'text-slate-300 hover:bg-slate-800 cursor-pointer'
                    }`}
                  >
                    Ex {s.code}
                  </button>
                );
              })}
            </div>

            <span className="text-xs font-mono text-slate-400 whitespace-nowrap">
              {hoverCoord
                ? `Die (${hoverCoord.col}, ${hoverCoord.row})`
                : `${placedCount} ${placedCount === 1 ? 'Cell' : 'Cells'} Placed`}
            </span>
          </div>

          <h2 className="text-sm sm:text-base font-semibold text-slate-100 leading-snug">
            {stage.title}
          </h2>
          <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
            {stage.goalSummary}
          </p>

          {/* Hero-to-Kicker (~2.5:1) Tabular Numerals PPA Strip */}
          <div className="grid grid-cols-4 gap-3 sm:gap-5 pt-3 mt-2.5 border-t border-slate-800/90">
            <div>
              <div className="text-[10px] font-mono tracking-wider text-slate-400">
                PPA SCORE
              </div>
              <div className="hud-numeral text-xl sm:text-2xl font-bold text-slate-50 leading-tight">
                {Math.round(simulation.ppaScore)}
              </div>
            </div>

            <div>
              <div className="text-[10px] font-mono tracking-wider text-slate-400">
                DELAY &le;{simulation.targetDelayPs}ps
              </div>
              <div
                className={`hud-numeral text-xl sm:text-2xl font-bold leading-tight ${
                  placedCount === 0
                    ? 'text-slate-400'
                    : simulation.timingMet
                      ? 'text-emerald-400'
                      : 'text-amber-400'
                }`}
              >
                {placedCount === 0 ? '0' : Math.round(simulation.criticalPathPs)}
                <span className="text-xs font-mono ml-0.5 font-normal">
                  {placedCount === 0 ? 'ps' : simulation.timingMet ? 'ps ✓' : 'ps ▲'}
                </span>
              </div>
            </div>

            <div>
              <div className="text-[10px] font-mono tracking-wider text-slate-400">
                POWER &le;{simulation.powerBudgetMw.toFixed(1)}mW
              </div>
              <div
                className={`hud-numeral text-xl sm:text-2xl font-bold leading-tight ${
                  simulation.powerMet ? 'text-sky-300' : 'text-rose-400'
                }`}
              >
                {simulation.dynamicPowerMw.toFixed(2)}
              </div>
            </div>

            <div>
              <div className="text-[10px] font-mono tracking-wider text-slate-400">
                VECTORS
              </div>
              <div
                className={`hud-numeral text-xl sm:text-2xl font-bold leading-tight ${
                  simulation.allVectorsPassed ? 'text-emerald-400' : 'text-slate-200'
                }`}
              >
                {simulation.passedCount}/{simulation.totalVectors}{' '}
                <span className="text-xs font-mono font-normal">
                  {simulation.allVectorsPassed ? 'PASS' : 'WAIT'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Top-Right Compact Utility Controls */}
        <div className="pointer-events-auto flex items-center gap-2 shrink-0">
          <button
            type="button"
            tabIndex={-1}
            aria-label="Toggle Silicon Copilot [C]"
            aria-expanded={copilotOpen}
            onClick={(e) => {
              e.currentTarget.blur();
              onToggleCopilot();
            }}
            className={`h-10 px-3.5 rounded-lg border text-xs font-medium flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              copilotOpen
                ? 'bg-sky-500 text-slate-950 border-sky-400 font-semibold'
                : 'bg-[#0b111e]/92 hover:bg-[#162138] text-slate-100 border-slate-700/80'
            }`}
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 3L4 7v10l8 4 8-4V7l-8-4z" />
              <path d="M9 12h6M12 9v6" />
            </svg>
            <span>Copilot [C]</span>
          </button>

          <button
            type="button"
            tabIndex={-1}
            aria-label="WebXR VR/AR and GitHub Pages Settings [X]"
            onClick={(e) => {
              e.currentTarget.blur();
              onOpenXRModal();
            }}
            className={`h-10 px-3 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              spatialTabletopMode
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/60'
                : 'bg-[#0b111e]/92 hover:bg-[#162138] text-slate-200 border-slate-700/80'
            }`}
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="7" width="20" height="10" rx="3" />
              <path d="M10 17l2-3 2 3" />
            </svg>
            <span className="hidden sm:inline">VR / AR [X]</span>
          </button>

          <button
            type="button"
            tabIndex={-1}
            aria-label="Clear Die Cells"
            onClick={(e) => {
              e.currentTarget.blur();
              onClearDie();
            }}
            className="w-10 h-10 rounded-lg bg-[#0b111e]/92 hover:bg-[#162138] border border-slate-700/80 text-slate-200 flex items-center justify-center transition-colors cursor-pointer shrink-0"
            title="Clear Die [Backspace]"
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />
            </svg>
          </button>

          <button
            type="button"
            tabIndex={-1}
            aria-label={muted ? 'Unmute Audio [M]' : 'Mute Audio [M]'}
            onClick={(e) => {
              e.currentTarget.blur();
              onToggleMute();
            }}
            className="w-10 h-10 rounded-lg bg-[#0b111e]/92 hover:bg-[#162138] border border-slate-700/80 text-slate-200 flex items-center justify-center transition-colors cursor-pointer shrink-0"
            title="Toggle Audio [M]"
          >
            {muted ? (
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 5L6 9H2v6h4l5 4V5zM22 9l-6 6M16 9l6 6" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 5L6 9H2v6h4l5 4V5zM15.5 8.5a5 5 0 0 1 0 7M19 5a9 9 0 0 1 0 14" />
              </svg>
            )}
          </button>

          <button
            type="button"
            tabIndex={-1}
            aria-label="Pause Menu [P]"
            onClick={(e) => {
              e.currentTarget.blur();
              onPause();
            }}
            className="w-10 h-10 rounded-lg bg-[#0b111e]/92 hover:bg-[#162138] border border-slate-700/80 text-slate-200 flex items-center justify-center transition-colors cursor-pointer shrink-0"
            title="Pause [P / Esc]"
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.2">
              <line x1="9" y1="6" x2="9" y2="18" />
              <line x1="15" y1="6" x2="15" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      {/* Unified Collapsible Bottom Control Dock (Zero Central Viewport Occlusion) */}
      <div className="flex flex-col items-center">
        <button
          type="button"
          tabIndex={-1}
          onClick={(e) => {
            e.currentTarget.blur();
            onToggleDock();
          }}
          className="pointer-events-auto px-3.5 py-1 rounded-t-lg border border-b-0 border-slate-700/80 text-xs font-mono text-slate-300 hover:text-white transition-colors cursor-pointer whitespace-nowrap"
          style={{ backgroundColor: 'rgba(10, 15, 28, 0.92)' }}
        >
          {dockCollapsed ? '▴ Show Workbench Dock [H]' : '▾ Hide Workbench Dock [H]'}
        </button>

        {!dockCollapsed && (
          <div
            className="pointer-events-auto w-full max-w-[940px] rounded-xl border border-slate-700/85 px-4 py-3 shadow-2xl"
            style={{ backgroundColor: 'rgba(10, 15, 28, 0.95)' }}
          >
            {/* DRC or Concept Guidance Strip */}
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 mb-2.5 border-b border-slate-800 text-xs">
              <div className="text-slate-300 truncate max-w-xl">
                {simulation.drcWarnings.length > 0 ? (
                  <span className="text-amber-300">
                    ▲ {simulation.drcWarnings[0]}
                  </span>
                ) : simulation.signoffReady ? (
                  <span className="text-emerald-300">
                    ✓ All truth vectors &amp; PPA timing constraints verified — ready for Tape-Out Signoff!
                  </span>
                ) : (
                  <span>
                    Drag cells from the 3D tray onto the 6×6 die (or select a cell below &amp; click any die socket).
                  </span>
                )}
              </div>

              {activeVec && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.currentTarget.blur();
                    onStepVector();
                  }}
                  className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 font-mono text-xs transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  Vec {(activeVectorIndex % simulation.vectors.length) + 1}/{simulation.vectors.length}:{' '}
                  {Object.entries(activeVec.inputs)
                    .map(([k, v]) => `${k.replace('IN_', '')}=${v}`)
                    .join(' ')}{' '}
                  →{' '}
                  {Object.entries(activeVec.actual)
                    .map(([k, v]) => `${k.replace('OUT_', '')}=${v ?? '?'}`)
                    .join(' ')}{' '}
                  {activeVec.passed ? '✓' : '×'} [V]
                </button>
              )}
            </div>

            {/* Palette Slots + Primary Signoff Action */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                {stage.availableGates.map((gt, idx) => {
                  const spec = GATE_SPECS[gt];
                  const isSelected = selectedGate === gt;
                  return (
                    <div key={gt} className="flex items-center">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.currentTarget.blur();
                          onSelectGate(gt);
                        }}
                        onDoubleClick={(e) => {
                          e.currentTarget.blur();
                          onQuickPlaceCenter(gt);
                        }}
                        title={`${spec.roleHint} (Double-click to quick-drop onto die)`}
                        className={`px-3 py-2 rounded-lg border text-left flex items-center gap-2.5 transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                          isSelected
                            ? 'bg-slate-800 border-amber-400 text-slate-50 shadow-md'
                            : 'bg-[#11192c] hover:bg-slate-800/80 border-slate-700/70 text-slate-300'
                        }`}
                      >
                        <GateMiniIcon type={gt} accent={spec.accentHex} />
                        <div>
                          <div className="text-xs font-semibold flex items-center gap-1.5">
                            <span>{spec.label}</span>
                            <span className="text-[10px] font-mono text-slate-400">
                              [{idx + 1}]
                            </span>
                          </div>
                          <div className="text-[10px] font-mono text-slate-400">
                            {spec.booleanExpr} · {spec.intrinsicDelayPs}ps
                          </div>
                        </div>
                      </button>
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center gap-2 shrink-0 ml-auto">
                <button
                  type="button"
                  onClick={(e) => {
                    e.currentTarget.blur();
                    onQuickPlaceCenter(selectedGate);
                  }}
                  className="px-3.5 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600/80 text-slate-100 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  Drop {selectedGate} on Die
                </button>

                <button
                  type="button"
                  onClick={(e) => {
                    e.currentTarget.blur();
                    onRunSignoff();
                  }}
                  className={`px-5 py-2.5 rounded-lg font-semibold text-xs sm:text-sm transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    simulation.signoffReady
                      ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-lg'
                      : 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                  }`}
                >
                  Run Tape-Out Signoff [Space]
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
