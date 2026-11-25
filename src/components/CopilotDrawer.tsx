import { FormEvent, useState } from 'react';
import { ChipStage, PlacedCell, SimulationReport } from '../game/types';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  isError?: boolean;
}

interface CopilotDrawerProps {
  open: boolean;
  stage: ChipStage;
  placedCells: PlacedCell[];
  simulation: SimulationReport;
  onClose: () => void;
}

const API_BASE = (import.meta.env.VITE_COPILOT_API_URL as string | undefined)?.replace(/\/$/, '') ?? '';

export function CopilotDrawer({
  open,
  stage,
  placedCells,
  simulation,
  onClose,
}: CopilotDrawerProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      text: 'Silicon Copilot ready. Drag CMOS cells onto the 6×6 wafer die, then ask me to inspect your wirelength, Elmore RC delay, or boolean synthesis.',
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  const sendQuestion = async (questionText: string) => {
    const trimmed = questionText.trim();
    if (!trimmed || loading) return;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      text: trimmed,
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const response = await fetch(`${API_BASE}/api/copilot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: trimmed,
          stageTitle: stage.title,
          stageGoal: stage.goalSummary,
          placedCells: placedCells.map((c) => ({
            type: c.type,
            col: c.col,
            row: c.row,
          })),
          metrics: {
            allVectorsPassed: simulation.allVectorsPassed,
            passedCount: simulation.passedCount,
            totalVectors: simulation.totalVectors,
            criticalPathPs: simulation.criticalPathPs,
            targetDelayPs: simulation.targetDelayPs,
            dynamicPowerMw: simulation.dynamicPowerMw,
            powerBudgetMw: simulation.powerBudgetMw,
            ppaScore: simulation.ppaScore,
            drcWarnings: simulation.drcWarnings,
          },
          history: messages
            .filter((m) => !m.isError)
            .slice(-4)
            .map((m) => ({ role: m.role, text: m.text })),
        }),
      });

      const data = (await response.json().catch(() => ({}))) as {
        reply?: string;
        error?: string;
      };

      if (!response.ok || !data.reply) {
        setMessages((prev) => [
          ...prev,
          {
            id: `e-${Date.now()}`,
            role: 'assistant',
            text:
              data.error ??
              `Copilot server returned status ${response.status}. Verify backend connectivity or Settings > Secrets.`,
            isError: true,
          },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: `a-${Date.now()}`,
            role: 'assistant',
            text: data.reply!,
          },
        ]);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setMessages((prev) => [
        ...prev,
        {
          id: `e-${Date.now()}`,
          role: 'assistant',
          text: `Could not reach Silicon Copilot endpoint (${msg}). If hosted on static GitHub Pages, set VITE_COPILOT_API_URL to your Cloud Run backend URL.`,
          isError: true,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    sendQuestion(input);
  };

  return (
    <aside
      aria-label="Silicon Copilot Mentor"
      className="fixed top-20 right-4 sm:right-5 bottom-24 w-[340px] sm:w-[370px] z-20 rounded-xl border border-slate-700/85 shadow-2xl flex flex-col overflow-hidden pointer-events-auto"
      style={{ backgroundColor: 'rgba(10, 15, 28, 0.96)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
        <div>
          <h3 className="text-sm font-semibold text-slate-100">Silicon Copilot</h3>
          <p className="text-[11px] text-slate-400 font-mono">
            Live Netlist &amp; STA Mentor · {placedCells.length} cells on die
          </p>
        </div>
        <button
          type="button"
          aria-label="Close Silicon Copilot"
          onClick={onClose}
          className="w-8 h-8 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 flex items-center justify-center transition-colors cursor-pointer"
        >
          ✕
        </button>
      </div>

      {/* Concept Callout */}
      <div className="px-4 py-2.5 bg-[#111a2e] border-b border-slate-800 text-xs text-slate-300 leading-relaxed">
        <span className="font-semibold text-amber-300">EDA Note: </span>
        {stage.conceptCallout}
      </div>

      {/* Messages Feed */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 text-xs leading-relaxed">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`rounded-lg px-3 py-2.5 ${
              m.role === 'user'
                ? 'bg-sky-500/20 border border-sky-500/40 text-slate-100 ml-6'
                : m.isError
                  ? 'bg-rose-950/60 border border-rose-700/60 text-rose-200 mr-3'
                  : 'bg-slate-800/85 border border-slate-700/70 text-slate-200 mr-3'
            }`}
          >
            <div className="text-[10px] font-mono text-slate-400 mb-1">
              {m.role === 'user' ? 'You' : m.isError ? 'Copilot Notice' : 'Silicon Copilot'}
            </div>
            <p className="whitespace-pre-wrap">{m.text}</p>
          </div>
        ))}

        {loading && (
          <div className="rounded-lg px-3 py-2.5 bg-slate-800/70 border border-slate-700/60 text-slate-300 mr-3 font-mono text-xs">
            Analyzing 6×6 floorplan &amp; RC timing...
          </div>
        )}
      </div>

      {/* Quick Prompts */}
      <div className="px-4 pt-2 pb-1 border-t border-slate-800 flex flex-wrap gap-1.5">
        {stage.copilotPrompts.map((prompt) => (
          <button
            key={prompt}
            type="button"
            disabled={loading}
            onClick={() => sendQuestion(prompt)}
            className="text-left text-[11px] px-2.5 py-1 rounded bg-slate-800/90 hover:bg-slate-700 text-sky-300 transition-colors cursor-pointer truncate max-w-full disabled:opacity-50"
          >
            {prompt}
          </button>
        ))}
      </div>

      {/* Input Form */}
      <form onSubmit={handleSubmit} className="p-3 flex items-center gap-2">
        <label htmlFor="copilot-question-input" className="sr-only">
          Ask Silicon Copilot about chip floorplanning
        </label>
        <input
          id="copilot-question-input"
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about timing, gates, or DRC..."
          disabled={loading}
          className="flex-1 min-w-0 rounded-lg bg-[#090d16] border border-slate-700 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-400"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="px-3.5 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 disabled:opacity-40 text-slate-950 font-semibold text-xs transition-colors cursor-pointer whitespace-nowrap shrink-0"
        >
          Ask
        </button>
      </form>
    </aside>
  );
}
