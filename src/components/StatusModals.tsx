import { POC_STAGES } from '../game/stages';
import { SignoffSnapshot } from '../game/types';
import { XRCapabilities } from '../xr/xrManager';

interface PauseModalProps {
  currentStageIndex: number;
  highestUnlockedStage: number;
  onResume: () => void;
  onRestartStage: () => void;
  onSelectStage: (idx: number) => void;
  onOpenXRModal: () => void;
  onReturnTitle: () => void;
}

export function PauseModal({
  currentStageIndex,
  highestUnlockedStage,
  onResume,
  onRestartStage,
  onSelectStage,
  onOpenXRModal,
  onReturnTitle,
}: PauseModalProps) {
  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(6, 10, 19, 0.82)' }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="pause-modal-title"
        className="w-full max-w-md rounded-xl border border-slate-700 p-6 shadow-2xl space-y-5"
        style={{ backgroundColor: '#0d1526' }}
      >
        <div>
          <h2 id="pause-modal-title" className="text-2xl font-bold text-slate-50">
            Cleanroom Paused
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Select a PoC exercise, calibrate WebXR, or resume floorplanning.
          </p>
        </div>

        <div className="space-y-2">
          <div className="text-xs font-mono text-slate-400">POC CURRICULUM STAGES</div>
          {POC_STAGES.map((s) => {
            const locked = s.index > highestUnlockedStage;
            const active = s.index === currentStageIndex;
            return (
              <button
                key={s.id}
                type="button"
                disabled={locked}
                onClick={() => onSelectStage(s.index)}
                className={`w-full text-left px-3.5 py-2.5 rounded-lg border text-xs transition-colors flex items-center justify-between ${
                  active
                    ? 'bg-amber-500/15 border-amber-400 text-slate-50 font-semibold cursor-pointer'
                    : locked
                      ? 'bg-slate-900/50 border-slate-800 text-slate-600 cursor-not-allowed'
                      : 'bg-slate-900/90 hover:bg-slate-800 border-slate-700/70 text-slate-200 cursor-pointer'
                }`}
              >
                <span>{s.title}</span>
                <span className="font-mono text-[11px]">
                  {locked ? 'Locked' : active ? 'Active' : 'Open'}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-col gap-2.5 pt-1">
          <button
            type="button"
            onClick={onResume}
            className="w-full py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-sm transition-colors cursor-pointer"
          >
            Resume Floorplanning
          </button>

          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={onRestartStage}
              className="py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-100 font-medium text-xs transition-colors cursor-pointer"
            >
              Reset Current Die
            </button>
            <button
              type="button"
              onClick={onOpenXRModal}
              className="py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-100 font-medium text-xs transition-colors cursor-pointer"
            >
              VR / AR &amp; GH-Pages
            </button>
          </div>

          <button
            type="button"
            onClick={onReturnTitle}
            className="w-full py-2 rounded-lg text-slate-400 hover:text-slate-200 text-xs transition-colors cursor-pointer"
          >
            Return to Title Screen
          </button>
        </div>
      </div>
    </div>
  );
}

interface SignoffModalProps {
  snapshot: SignoffSnapshot;
  hasNextStage: boolean;
  onNextOrRetry: () => void;
  onOptimizeCurrent: () => void;
}

export function SignoffModal({
  snapshot,
  hasNextStage,
  onNextOrRetry,
  onOptimizeCurrent,
}: SignoffModalProps) {
  const isVictory = snapshot.outcome === 'victory';

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(6, 10, 19, 0.84)' }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="signoff-modal-title"
        className="w-full max-w-md rounded-xl border border-slate-700 p-6 shadow-2xl space-y-5"
        style={{ backgroundColor: '#0d1526' }}
      >
        <div>
          <div className="text-xs font-mono text-slate-400">
            {isVictory ? 'TAPE-OUT SIGNOFF VERIFIED ✓' : 'DRC / TIMING SIGNOFF HOLD ▲'}
          </div>
          <h2 id="signoff-modal-title" className="text-2xl font-bold text-slate-50 mt-1">
            {isVictory ? 'Silicon Die Verified' : 'Signoff Constraints Unmet'}
          </h2>
          <p className="text-xs text-slate-300 mt-1">
            {isVictory
              ? `${snapshot.stageTitle} passed all boolean vectors and Elmore RC timing targets.`
              : snapshot.failureReason ??
                'Adjust standard cell placement or boolean logic to satisfy all tape-out targets.'}
          </p>
        </div>

        {/* 3 Tabular-Nums Mastery Stat Tiles */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg bg-[#090e1a] border border-slate-800 p-3">
            <div className="text-[10px] font-mono text-slate-400">PPA / BEST</div>
            <div className="hud-numeral text-xl font-bold text-amber-400 mt-0.5">
              {snapshot.ppaScore}
              <span className="text-xs text-slate-400 font-normal">/{snapshot.bestScore}</span>
            </div>
          </div>

          <div className="rounded-lg bg-[#090e1a] border border-slate-800 p-3">
            <div className="text-[10px] font-mono text-slate-400">CRIT PATH</div>
            <div
              className={`hud-numeral text-xl font-bold mt-0.5 ${
                snapshot.criticalPathPs > 0 && snapshot.criticalPathPs <= snapshot.targetDelayPs
                  ? 'text-emerald-400'
                  : 'text-rose-400'
              }`}
            >
              {snapshot.criticalPathPs}ps
            </div>
          </div>

          <div className="rounded-lg bg-[#090e1a] border border-slate-800 p-3">
            <div className="text-[10px] font-mono text-slate-400">VECTORS</div>
            <div className="hud-numeral text-xl font-bold text-sky-300 mt-0.5">
              {snapshot.passedCount}/{snapshot.totalVectors}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between text-xs font-mono text-slate-400 pt-1 border-t border-slate-800">
          <span>Power: {snapshot.dynamicPowerMw.toFixed(2)} mW</span>
          <span>Elapsed: {Math.round(snapshot.clearTimeSec)}s</span>
        </div>

        <div className="flex flex-col gap-2.5">
          <button
            type="button"
            data-start="true"
            onClick={onNextOrRetry}
            className="w-full py-3 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-sm transition-colors cursor-pointer"
          >
            {isVictory
              ? hasNextStage
                ? 'Next PoC Exercise'
                : 'Replay PoC Suite'
              : 'Adjust Die Floorplan'}
          </button>

          {isVictory && (
            <button
              type="button"
              onClick={onOptimizeCurrent}
              className="w-full py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition-colors cursor-pointer"
            >
              Keep Optimizing Current Die
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

interface XRAndDeployModalProps {
  open: boolean;
  xrCapabilities: XRCapabilities;
  xrError: string | null;
  spatialTabletopMode: boolean;
  arPassthroughPreview: boolean;
  onLaunchXR: (mode: 'immersive-vr' | 'immersive-ar') => void;
  onToggleSpatialTabletop: () => void;
  onToggleArPreview: () => void;
  onClose: () => void;
}

export function XRAndDeployModal({
  open,
  xrCapabilities,
  xrError,
  spatialTabletopMode,
  arPassthroughPreview,
  onLaunchXR,
  onToggleSpatialTabletop,
  onToggleArPreview,
  onClose,
}: XRAndDeployModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center p-4 pointer-events-auto"
      style={{ backgroundColor: 'rgba(6, 10, 19, 0.84)' }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="xr-deploy-title"
        className="w-full max-w-lg rounded-xl border border-slate-700 p-6 shadow-2xl space-y-5"
        style={{ backgroundColor: '#0d1526' }}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="xr-deploy-title" className="text-xl font-bold text-slate-50">
              WebXR (VR / AR) &amp; GitHub Pages Hosting
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Spatial tabletop controller raycasting and static gh-pages deployment setup.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close WebXR and Hosting modal"
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* WebXR Controls */}
        <div className="space-y-3 rounded-lg bg-[#090e1a] border border-slate-800 p-4">
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-slate-300 font-semibold">IMMERSIVE WEBXR SESSIONS</span>
            <span className="text-slate-400">
              VR: {xrCapabilities.vrSupported ? 'Ready ✓' : 'No Headset'} · AR:{' '}
              {xrCapabilities.arSupported ? 'Ready ✓' : 'No Passthrough'}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => onLaunchXR('immersive-vr')}
              className="py-2.5 px-3 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs transition-colors cursor-pointer"
            >
              Enter Immersive VR
            </button>
            <button
              type="button"
              onClick={() => onLaunchXR('immersive-ar')}
              className="py-2.5 px-3 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs transition-colors cursor-pointer"
            >
              Enter Tabletop AR
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2.5 pt-1">
            <button
              type="button"
              onClick={onToggleSpatialTabletop}
              className={`py-2 px-3 rounded-lg border text-xs font-medium transition-colors cursor-pointer ${
                spatialTabletopMode
                  ? 'bg-sky-500/20 border-sky-400 text-sky-200'
                  : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:bg-slate-800'
              }`}
            >
              {spatialTabletopMode ? '✓ Tabletop Camera Active' : 'Desktop Tabletop View'}
            </button>

            <button
              type="button"
              onClick={onToggleArPreview}
              className={`py-2 px-3 rounded-lg border text-xs font-medium transition-colors cursor-pointer ${
                arPassthroughPreview
                  ? 'bg-amber-500/20 border-amber-400 text-amber-200'
                  : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:bg-slate-800'
              }`}
            >
              {arPassthroughPreview ? '✓ High-Contrast Lab Mat' : 'Toggle Lab Contrast Mat'}
            </button>
          </div>

          {xrError && (
            <p className="text-xs text-amber-300 leading-relaxed pt-1">
              {xrError}
            </p>
          )}
        </div>

        {/* GitHub Pages Workflow Info */}
        <div className="space-y-2 rounded-lg bg-[#090e1a] border border-slate-800 p-4 text-xs">
          <div className="font-mono text-slate-300 font-semibold">
            GITHUB PAGES (GH-PAGES) READY
          </div>
          <p className="text-slate-400 leading-relaxed">
            Preconfigured with relative asset paths (<code className="text-slate-200">--base=./</code>), HTTPS WebXR compatibility, and <code className="text-slate-200">.github/workflows/deploy-gh-pages.yml</code>.
          </p>
          <div className="rounded bg-slate-950 border border-slate-800 px-3 py-2 font-mono text-[11px] text-sky-300 select-all">
            npm run deploy
          </div>
          <p className="text-[11px] text-slate-400">
            Set repository variable <code className="text-slate-300">VITE_COPILOT_API_URL</code> to your hosted server URL so your Gemini API key stays server-side.
          </p>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="w-full py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-100 font-medium text-xs transition-colors cursor-pointer"
        >
          Done
        </button>
      </div>
    </div>
  );
}
