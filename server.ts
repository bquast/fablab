import 'dotenv/config';
import express from 'express';
import type { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const isProduction = process.env.NODE_ENV === 'production';

interface CopilotCellInput {
  type: string;
  col: number;
  row: number;
}

interface CopilotRequestBody {
  message?: string;
  stageTitle?: string;
  stageGoal?: string;
  placedCells?: CopilotCellInput[];
  metrics?: {
    allVectorsPassed?: boolean;
    passedCount?: number;
    totalVectors?: number;
    criticalPathPs?: number;
    targetDelayPs?: number;
    dynamicPowerMw?: number;
    powerBudgetMw?: number;
    ppaScore?: number;
    drcWarnings?: string[];
  };
  history?: Array<{ role: 'user' | 'assistant'; text: string }>;
}

function getGenAIClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY' || apiKey.trim() === '') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '256kb' }));

  // Support cross-origin requests when the static frontend is hosted on GitHub Pages
  app.use('/api', (req: Request, res: Response, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      copilotReady: Boolean(getGenAIClient()),
    });
  });

  app.post('/api/copilot', async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as CopilotRequestBody;
    const rawMessage = typeof body.message === 'string' ? body.message.trim() : '';

    if (!rawMessage) {
      res.status(400).json({ error: 'Please enter a question or tap an analysis prompt for your Silicon Copilot.' });
      return;
    }
    if (rawMessage.length > 1200) {
      res.status(400).json({ error: 'Message exceeds maximum length of 1,200 characters.' });
      return;
    }

    const ai = getGenAIClient();
    if (!ai) {
      res.status(503).json({
        error:
          'GEMINI_API_KEY is not configured on the server. Add a valid Gemini API key in Settings > Secrets to enable live Silicon Copilot responses.',
      });
      return;
    }

    const cellsSummary = Array.isArray(body.placedCells) && body.placedCells.length > 0
      ? body.placedCells
          .slice(0, 36)
          .map((c) => `${String(c.type)} at (col=${Number(c.col)}, row=${Number(c.row)})`)
          .join(', ')
      : 'No standard cells placed on the 6x6 silicon die yet.';

    const m = body.metrics ?? {};
    const drcList = Array.isArray(m.drcWarnings) && m.drcWarnings.length > 0
      ? m.drcWarnings.join(' | ')
      : 'None';

    const dieContext = [
      `Current PoC Exercise: ${body.stageTitle ?? 'Silicon Floorplanning'}`,
      `Design Spec: ${body.stageGoal ?? 'Meet functional truth table and PPA timing/power targets.'}`,
      `6x6 Die Floorplan (West col=-1 Input Pads -> col 0..5 Standard Cells -> East col=6 Output Pads): ${cellsSummary}`,
      `Live Telemetry: Vectors=${m.passedCount ?? 0}/${m.totalVectors ?? 0} (${m.allVectorsPassed ? 'PASS' : 'INCOMPLETE'}), Critical Path=${m.criticalPathPs ?? 0}ps (Target <= ${m.targetDelayPs ?? 0}ps), Power=${m.dynamicPowerMw ?? 0}mW (Budget <= ${m.powerBudgetMw ?? 0}mW), PPA Score=${m.ppaScore ?? 0}/100`,
      `DRC / Timing Advisories: ${drcList}`,
    ].join('\n');

    const recentHistory = Array.isArray(body.history)
      ? body.history
          .slice(-4)
          .map((turn) => `${turn.role === 'user' ? 'Student' : 'Copilot'}: ${String(turn.text).slice(0, 400)}`)
          .join('\n')
      : '';

    const systemInstruction = [
      'You are Silicon Copilot, an expert VLSI & ASIC physical design mentor inside FabLab 3D, an interactive 3D/WebXR chip floorplanning game.',
      'The student drags CMOS standard cells (NOT, BUF, NAND2, AND2, OR2, XOR2) onto a 6x6 silicon wafer grid (columns 0..5, rows 0..5).',
      'Signal routing flows West-to-East: West Input Pads sit at col=-1, gates connect to their closest upstream drivers strictly to the West (smaller col), and East Output Pads at col=6 connect to the closest placed gate by Manhattan distance.',
      'Elmore wire RC delay grows quadratically with Manhattan wire segment length, so placing cells near the row of their target pads and centered horizontally (around col 2-3, or chained col 2 -> col 4) minimizes critical path delay.',
      'Keep every response concise (2 to 4 short sentences, under 95 words), practical, and grounded in the exact coordinates and telemetry provided. Suggest specific (col, row) placements or CMOS insights without giving walls of text.',
    ].join(' ');

    const promptText = recentHistory
      ? `${dieContext}\n\nRecent Conversation:\n${recentHistory}\n\nStudent Question: ${rawMessage}`
      : `${dieContext}\n\nStudent Question: ${rawMessage}`;

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: promptText,
        config: {
          systemInstruction,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      });

      const reply = (response.text ?? '').trim();
      if (!reply) {
        res.status(502).json({ error: 'Silicon Copilot returned an empty response. Please try again.' });
        return;
      }

      res.json({ reply });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      const status = /429|RESOURCE_EXHAUSTED/i.test(message)
        ? 429
        : /403|PERMISSION_DENIED|API_KEY_INVALID|400/i.test(message)
          ? 403
          : 500;

      res.status(status).json({
        error:
          status === 403
            ? 'Gemini API key rejected or missing permissions. Check Settings > Secrets to verify GEMINI_API_KEY.'
            : status === 429
              ? 'Gemini API quota reached. Try again shortly or attach a billing-enabled key in Settings > Secrets.'
              : `Copilot request failed: ${message}`,
      });
    }
  });

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`FabLab 3D server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
