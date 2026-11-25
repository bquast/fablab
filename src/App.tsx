import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { soundSynth } from './audio/synth';
import { CopilotDrawer } from './components/CopilotDrawer';
import { HudOverlay } from './components/HudOverlay';
import { SiliconCanvas, SiliconCanvasHandle } from './components/SiliconCanvas';
import {
  PauseModal,
  SignoffModal,
  XRAndDeployModal,
} from './components/StatusModals';
import { TitleScreen } from './components/TitleScreen';
import { placeOrMoveCell, removeCellById, simulateFloorplan } from './game/rules';
import { DIE_COLS, DIE_ROWS, POC_STAGES } from './game/stages';
import {
  GameScreenState,
  GateType,
  PlacedCell,
  SignoffSnapshot,
} from './game/types';
import { XRCapabilities, probeXRCapabilities } from './xr/xrManager';

function getInitialScreenState(): GameScreenState {
  if (typeof window === 'undefined') return 'title';
  const params = new URLSearchParams(window.location.search);
  return params.get('autostart') === '1' ? 'playing' : 'title';
}

export default function App() {
  const [screenState, setScreenState] = useState<GameScreenState>(getInitialScreenState);
  const [stageIndex, setStageIndex] = useState(0);
  const [highestUnlockedStage, setHighestUnlockedStage] = useState(0);
  const [placedCellsByStage, setPlacedCellsByStage] = useState<Record<number, PlacedCell[]>>({
    0: [],
    1: [],
    2: [],
  });
  const [bestScoreByStage, setBestScoreByStage] = useState<Record<number, number>>({
    0: 0,
    1: 0,
    2: 0,
  });

  const stage = POC_STAGES[stageIndex] ?? POC_STAGES[0];
  const placedCells = placedCellsByStage[stageIndex] ?? [];

  const [selectedGate, setSelectedGate] = useState<GateType>(stage.availableGates[0]);
  const [activeVectorIndex, setActiveVectorIndex] = useState(0);
  const [hoverCoord, setHoverCoord] = useState<{ col: number; row: number } | null>(null);
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [muted, setMuted] = useState(false);
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [xrModalOpen, setXrModalOpen] = useState(false);
  const [spatialTabletopMode, setSpatialTabletopMode] = useState(false);
  const [arPassthroughPreview, setArPassthroughPreview] = useState(false);
  const [xrError, setXrError] = useState<string | null>(null);
  const [xrCapabilities, setXrCapabilities] = useState<XRCapabilities>({
    vrSupported: false,
    arSupported: false,
    activeSessionMode: 'none',
  });
  const [signoffSnapshot, setSignoffSnapshot] = useState<SignoffSnapshot | null>(null);

  const stageStartTimeRef = useRef<number>(Date.now());
  const domOverlayRef = useRef<HTMLDivElement | null>(null);
  const canvasApiRef = useRef<SiliconCanvasHandle | null>(null);

  // Sync game state machine to document.body.dataset.state
  useEffect(() => {
    document.body.dataset.state = screenState;
  }, [screenState]);

  // Probe WebXR headset / AR support on mount
  useEffect(() => {
    let active = true;
    probeXRCapabilities().then(({ vrSupported, arSupported }) => {
      if (active) {
        setXrCapabilities((prev) => ({ ...prev, vrSupported, arSupported }));
      }
    });
    return () => {
      active = false;
    };
  }, []);

  // Keep selectedGate valid when switching stages
  useEffect(() => {
    if (!stage.availableGates.includes(selectedGate)) {
      setSelectedGate(stage.availableGates[0]);
    }
  }, [stage, selectedGate]);

  const simulation = useMemo(
    () => simulateFloorplan(stage, placedCells, activeVectorIndex),
    [stage, placedCells, activeVectorIndex],
  );

  const handleStartPlaying = useCallback(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    stageStartTimeRef.current = Date.now();
    setSignoffSnapshot(null);
    setScreenState('playing');
    canvasApiRef.current?.resetCamera();
  }, []);

  const handlePlaceOrMoveCell = useCallback(
    (cell: PlacedCell) => {
      setPlacedCellsByStage((prev) => ({
        ...prev,
        [stageIndex]: placeOrMoveCell(prev[stageIndex] ?? [], cell),
      }));
    },
    [stageIndex],
  );

  const handleRemoveCell = useCallback(
    (id: string) => {
      setPlacedCellsByStage((prev) => ({
        ...prev,
        [stageIndex]: removeCellById(prev[stageIndex] ?? [], id),
      }));
    },
    [stageIndex],
  );

  const handleQuickPlaceCenter = useCallback(
    (gate: GateType) => {
      const current = placedCellsByStage[stageIndex] ?? [];
      // Choose an open optimal candidate socket near center of die
      const preferredCoords: Array<[number, number]> = [
        [3, 2],
        [2, 2],
        [4, 2],
        [3, 1],
        [3, 4],
        [2, 1],
        [2, 4],
        [4, 1],
        [4, 4],
      ];
      for (let r = 0; r < DIE_ROWS; r++) {
        for (let c = 0; c < DIE_COLS; c++) {
          preferredCoords.push([c, r]);
        }
      }
      const open = preferredCoords.find(
        ([c, r]) => !current.some((cell) => cell.col === c && cell.row === r),
      );
      if (!open) return;

      handlePlaceOrMoveCell({
        id: `cell-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        type: gate,
        col: open[0],
        row: open[1],
      });
      soundSynth.playSnapPlace(true);
    },
    [placedCellsByStage, stageIndex, handlePlaceOrMoveCell],
  );

  const handleClearDie = useCallback(() => {
    setPlacedCellsByStage((prev) => ({
      ...prev,
      [stageIndex]: [],
    }));
    soundSynth.playRemove();
  }, [stageIndex]);

  const handleSelectStage = useCallback((idx: number) => {
    setStageIndex(idx);
    setActiveVectorIndex(0);
    stageStartTimeRef.current = Date.now();
    setSignoffSnapshot(null);
    setScreenState('playing');
  }, []);

  const handleRunSignoff = useCallback(() => {
    const elapsedSec = Math.max(1, (Date.now() - stageStartTimeRef.current) / 1000);
    canvasApiRef.current?.triggerSignoffPulse();

    if (simulation.signoffReady) {
      const prevBest = bestScoreByStage[stageIndex] ?? 0;
      const nextBest = Math.max(prevBest, simulation.ppaScore);
      setBestScoreByStage((prev) => ({ ...prev, [stageIndex]: nextBest }));
      setHighestUnlockedStage((prev) =>
        Math.min(POC_STAGES.length - 1, Math.max(prev, stageIndex + 1)),
      );
      setSignoffSnapshot({
        outcome: 'victory',
        stageIndex,
        stageTitle: stage.title,
        ppaScore: simulation.ppaScore,
        bestScore: nextBest,
        criticalPathPs: simulation.criticalPathPs,
        targetDelayPs: simulation.targetDelayPs,
        dynamicPowerMw: simulation.dynamicPowerMw,
        powerBudgetMw: simulation.powerBudgetMw,
        passedCount: simulation.passedCount,
        totalVectors: simulation.totalVectors,
        clearTimeSec: elapsedSec,
      });
      soundSynth.playSignoffVictory();
      setScreenState('gameover');
    } else {
      const reason =
        placedCells.length === 0
          ? 'No standard cells have been placed on the 6×6 silicon die yet.'
          : !simulation.allVectorsPassed
            ? `Boolean verification passed ${simulation.passedCount}/${simulation.totalVectors} vectors. Check gate types and West-to-East pad alignment.`
            : simulation.drcWarnings[0] ?? 'Timing or power target exceeded.';

      setSignoffSnapshot({
        outcome: 'violation',
        stageIndex,
        stageTitle: stage.title,
        ppaScore: simulation.ppaScore,
        bestScore: bestScoreByStage[stageIndex] ?? 0,
        criticalPathPs: simulation.criticalPathPs,
        targetDelayPs: simulation.targetDelayPs,
        dynamicPowerMw: simulation.dynamicPowerMw,
        powerBudgetMw: simulation.powerBudgetMw,
        passedCount: simulation.passedCount,
        totalVectors: simulation.totalVectors,
        clearTimeSec: elapsedSec,
        failureReason: reason,
      });
      soundSynth.playViolation();
      setScreenState('gameover');
    }
  }, [simulation, bestScoreByStage, stageIndex, stage.title, placedCells.length]);

  const handleLaunchXR = useCallback(async (mode: 'immersive-vr' | 'immersive-ar') => {
    setXrError(null);
    if (!canvasApiRef.current) return;
    const res = await canvasApiRef.current.enterXR(mode);
    if (!res.ok && res.error) {
      setXrError(res.error);
    } else {
      setXrModalOpen(false);
      setScreenState('playing');
    }
  }, []);

  // Global keyboard shortcuts (Title Enter/Space, Playing 1-6, V, H, C, M, P/Esc, Space)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }

      if (screenState === 'title') {
        if (e.code === 'Enter' || e.code === 'Space') {
          e.preventDefault();
          handleStartPlaying();
        }
        return;
      }

      if (screenState === 'gameover') {
        if (e.code === 'Enter' || e.code === 'Space') {
          e.preventDefault();
          if (signoffSnapshot?.outcome === 'victory') {
            const nextIdx = stageIndex + 1 < POC_STAGES.length ? stageIndex + 1 : 0;
            handleSelectStage(nextIdx);
          } else {
            setSignoffSnapshot(null);
            setScreenState('playing');
          }
        }
        return;
      }

      if (e.code === 'Escape' || e.code === 'KeyP') {
        e.preventDefault();
        if (xrModalOpen) {
          setXrModalOpen(false);
          return;
        }
        setScreenState((prev) => (prev === 'paused' ? 'playing' : 'paused'));
        return;
      }

      if (screenState !== 'playing') return;

      if (e.code.startsWith('Digit')) {
        const idx = Number(e.code.replace('Digit', '')) - 1;
        if (idx >= 0 && idx < stage.availableGates.length) {
          setSelectedGate(stage.availableGates[idx]);
        }
      } else if (e.code === 'KeyH') {
        setDockCollapsed((prev) => !prev);
      } else if (e.code === 'KeyC') {
        setCopilotOpen((prev) => !prev);
      } else if (e.code === 'KeyX') {
        setXrModalOpen((prev) => !prev);
      } else if (e.code === 'KeyM') {
        setMuted((prev) => {
          const next = !prev;
          soundSynth.setMuted(next);
          return next;
        });
      } else if (e.code === 'KeyV') {
        setActiveVectorIndex((prev) => prev + 1);
        soundSynth.playVectorPulse();
      } else if (e.code === 'Backspace') {
        handleClearDie();
      } else if (e.code === 'Space') {
        e.preventDefault();
        handleRunSignoff();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    screenState,
    stage.availableGates,
    xrModalOpen,
    signoffSnapshot,
    stageIndex,
    handleStartPlaying,
    handleSelectStage,
    handleClearDie,
    handleRunSignoff,
  ]);

  return (
    <div ref={domOverlayRef} className="relative w-full h-full overflow-hidden">
      {/* Persistent Three.js + WebXR Silicon Workbench Canvas */}
      <SiliconCanvas
        screenState={screenState}
        stage={stage}
        placedCells={placedCells}
        simulation={simulation}
        selectedPaletteGate={selectedGate}
        spatialTabletopMode={spatialTabletopMode}
        arPassthroughPreview={arPassthroughPreview}
        domOverlayRef={domOverlayRef}
        canvasApiRef={canvasApiRef}
        onSelectPaletteGate={setSelectedGate}
        onPlaceOrMoveCell={handlePlaceOrMoveCell}
        onRemoveCell={handleRemoveCell}
        onHoverCoordChange={setHoverCoord}
        onXRModeChange={(mode) =>
          setXrCapabilities((prev) => ({ ...prev, activeSessionMode: mode }))
        }
      />

      {screenState === 'title' && (
        <TitleScreen
          xrCapabilities={xrCapabilities}
          onStart={handleStartPlaying}
          onOpenXRModal={() => setXrModalOpen(true)}
        />
      )}

      {screenState !== 'title' && (
        <HudOverlay
          stage={stage}
          highestUnlockedStage={highestUnlockedStage}
          simulation={simulation}
          placedCount={placedCells.length}
          selectedGate={selectedGate}
          activeVectorIndex={activeVectorIndex}
          hoverCoord={hoverCoord}
          dockCollapsed={dockCollapsed}
          muted={muted}
          copilotOpen={copilotOpen}
          spatialTabletopMode={spatialTabletopMode}
          onSelectStage={handleSelectStage}
          onSelectGate={setSelectedGate}
          onQuickPlaceCenter={handleQuickPlaceCenter}
          onStepVector={() => {
            setActiveVectorIndex((prev) => prev + 1);
            soundSynth.playVectorPulse();
          }}
          onRunSignoff={handleRunSignoff}
          onClearDie={handleClearDie}
          onToggleDock={() => setDockCollapsed((prev) => !prev)}
          onToggleMute={() => {
            setMuted((prev) => {
              const next = !prev;
              soundSynth.setMuted(next);
              return next;
            });
          }}
          onToggleCopilot={() => setCopilotOpen((prev) => !prev)}
          onOpenXRModal={() => setXrModalOpen(true)}
          onPause={() => setScreenState('paused')}
        />
      )}

      {screenState === 'playing' && (
        <CopilotDrawer
          open={copilotOpen}
          stage={stage}
          placedCells={placedCells}
          simulation={simulation}
          onClose={() => setCopilotOpen(false)}
        />
      )}

      {screenState === 'paused' && (
        <PauseModal
          currentStageIndex={stageIndex}
          highestUnlockedStage={highestUnlockedStage}
          onResume={() => setScreenState('playing')}
          onRestartStage={() => {
            handleClearDie();
            setScreenState('playing');
          }}
          onSelectStage={handleSelectStage}
          onOpenXRModal={() => setXrModalOpen(true)}
          onReturnTitle={() => {
            setCopilotOpen(false);
            setScreenState('title');
          }}
        />
      )}

      {screenState === 'gameover' && signoffSnapshot && (
        <SignoffModal
          snapshot={signoffSnapshot}
          hasNextStage={stageIndex + 1 < POC_STAGES.length}
          onNextOrRetry={() => {
            if (signoffSnapshot.outcome === 'victory') {
              const nextIdx = stageIndex + 1 < POC_STAGES.length ? stageIndex + 1 : 0;
              handleSelectStage(nextIdx);
            } else {
              setSignoffSnapshot(null);
              setScreenState('playing');
            }
          }}
          onOptimizeCurrent={() => {
            setSignoffSnapshot(null);
            setScreenState('playing');
          }}
        />
      )}

      <XRAndDeployModal
        open={xrModalOpen}
        xrCapabilities={xrCapabilities}
        xrError={xrError}
        spatialTabletopMode={spatialTabletopMode}
        arPassthroughPreview={arPassthroughPreview}
        onLaunchXR={handleLaunchXR}
        onToggleSpatialTabletop={() => setSpatialTabletopMode((prev) => !prev)}
        onToggleArPreview={() => setArPassthroughPreview((prev) => !prev)}
        onClose={() => setXrModalOpen(false)}
      />
    </div>
  );
}
