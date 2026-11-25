import { XRCapabilities } from '../xr/xrManager';

interface TitleScreenProps {
  xrCapabilities: XRCapabilities;
  onStart: () => void;
  onOpenXRModal: () => void;
}

export function TitleScreen({
  xrCapabilities,
  onStart,
  onOpenXRModal,
}: TitleScreenProps) {
  return (
    <div
      className="fixed inset-0 z-20 flex flex-col justify-between pointer-events-none select-none"
      style={{
        background:
          'linear-gradient(95deg, rgba(7, 11, 20, 0.94) 0%, rgba(7, 11, 20, 0.78) 38%, rgba(7, 11, 20, 0.12) 68%, rgba(7, 11, 20, 0.0) 100%)',
      }}
    >
      {/* Left-third negative-space focal lockup */}
      <main className="flex-1 flex flex-col justify-center px-8 sm:px-14 lg:px-20 max-w-2xl">
        <div className="pointer-events-auto space-y-6">
          {/* Custom Inline SVG Silicon Wafer & Die Emblem Lockup */}
          <div className="space-y-3">
            <svg
              viewBox="0 0 360 76"
              className="w-72 sm:w-88 h-auto overflow-visible"
              role="img"
              aria-label="FabLab 3D Silicon Floorplanner emblem"
            >
              {/* Die reticle crest */}
              <rect
                x="4"
                y="8"
                width="60"
                height="60"
                rx="10"
                fill="#0f172a"
                stroke="#f59e0b"
                strokeWidth="2.5"
              />
              {/* Gold bond pins */}
              <line x1="0" y1="22" x2="8" y2="22" stroke="#fbbf24" strokeWidth="3" />
              <line x1="0" y1="38" x2="8" y2="38" stroke="#fbbf24" strokeWidth="3" />
              <line x1="0" y1="54" x2="8" y2="54" stroke="#fbbf24" strokeWidth="3" />
              <line x1="60" y1="22" x2="68" y2="22" stroke="#38bdf8" strokeWidth="3" />
              <line x1="60" y1="38" x2="68" y2="38" stroke="#38bdf8" strokeWidth="3" />
              <line x1="60" y1="54" x2="68" y2="54" stroke="#38bdf8" strokeWidth="3" />
              {/* Internal CMOS die pathways */}
              <rect
                x="15"
                y="19"
                width="16"
                height="16"
                rx="2"
                fill="#1e293b"
                stroke="#38bdf8"
                strokeWidth="1.8"
              />
              <rect
                x="37"
                y="41"
                width="16"
                height="16"
                rx="2"
                fill="#1e293b"
                stroke="#f59e0b"
                strokeWidth="1.8"
              />
              <path
                d="M31 27 H45 V41"
                fill="none"
                stroke="#fbbf24"
                strokeWidth="2.2"
                strokeLinecap="round"
              />
              <circle cx="45" cy="27" r="2.5" fill="#fef08a" />
              {/* Wordmark */}
              <text
                x="82"
                y="43"
                fill="#f8fafc"
                fontFamily="Outfit, sans-serif"
                fontWeight="700"
                fontSize="36"
                letterSpacing="-0.02em"
              >
                FABLAB 3D
              </text>
              <text
                x="84"
                y="64"
                fill="#94a3b8"
                fontFamily="IBM Plex Mono, monospace"
                fontWeight="500"
                fontSize="13"
                letterSpacing="0.06em"
              >
                SILICON FLOORPLANNER · POC
              </text>
            </svg>

            <h1
              className="text-3xl sm:text-5xl font-bold tracking-tight text-slate-50 leading-[1.1]"
              style={{ textWrap: 'balance' }}
            >
              Master CMOS chip floorplanning in tactile 3D.
            </h1>

            <p className="text-sm sm:text-base text-slate-300 max-w-lg leading-relaxed">
              Drag standard logic cells onto a 300mm silicon wafer die, route dual-layer copper interconnects, and hit picosecond timing targets with your Silicon Copilot.
            </p>
          </div>

          {/* Primary Actions (<= 3 actions total) */}
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              type="button"
              data-start="true"
              onClick={(e) => {
                e.currentTarget.blur();
                onStart();
              }}
              className="px-6 py-3.5 rounded-lg bg-amber-500 hover:bg-amber-400 active:translate-y-px text-slate-950 font-semibold text-base transition-colors cursor-pointer whitespace-nowrap shrink-0 shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400"
            >
              Start Floorplanning
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.currentTarget.blur();
                onOpenXRModal();
              }}
              className="px-5 py-3.5 rounded-lg bg-[#131d31] hover:bg-[#1c2a45] border border-slate-700/80 text-slate-100 font-medium text-sm transition-colors cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"
            >
              {xrCapabilities.vrSupported || xrCapabilities.arSupported
                ? 'Launch WebXR (VR / AR)'
                : 'VR / AR & GH-Pages'}
            </button>
          </div>

          {/* Unboxed clean metadata line */}
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 font-mono">
            <span>3 PoC Exercises</span>
            <span aria-hidden="true">·</span>
            <span>6×6 CMOS Die</span>
            <span aria-hidden="true">·</span>
            <span>WebXR Ready</span>
            <span aria-hidden="true">·</span>
            <span>Silicon Copilot</span>
          </div>
        </div>
      </main>

      {/* Flat borderless bottom control hint in safe margin */}
      <div className="px-8 sm:px-14 lg:px-20 pb-6 text-xs text-slate-400 font-mono tracking-wide">
        Drag &amp; Drop IC Cells · Click Empty Tile to Place · Right-Click Cell to Remove · Space Run Signoff · Esc Pause
      </div>
    </div>
  );
}
