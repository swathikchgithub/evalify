// app/api/mcp-proxy/route.ts
// Proxy for the MCP Explorer tab. Maps MCP tool calls to real LLM calls.
// Reuses the same provider setup as app/api/judge/route.ts.

import { openai }                  from '@ai-sdk/openai';
import { anthropic }               from '@ai-sdk/anthropic';
import { createGroq }              from '@ai-sdk/groq';
import { google }                  from '@ai-sdk/google';
import { createOpenAICompatible }  from '@ai-sdk/openai-compatible';
import { generateText }            from 'ai';

export const runtime = 'nodejs';

const groq = createGroq({ apiKey: process.env.GROQ_API_KEY });
const openrouter = createOpenAICompatible({
  name: 'openrouter',
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY,
  headers: { 'HTTP-Referer': 'https://evalify-six.vercel.app', 'X-Title': 'Evalify' },
});

function getModel(id: string) {
  if (id.startsWith('claude'))                             return anthropic(id);
  if (id.startsWith('llama') || id.startsWith('mixtral')) return groq(id);
  if (id.startsWith('gemini'))                             return google(id);
  if (id.includes('/'))                                    return openrouter(id);
  return openai(id ?? 'gpt-4o-mini');
}

async function callLLM(modelId: string, prompt: string, temperature = 0.7): Promise<string> {
  const { text } = await generateText({ model: getModel(modelId), prompt, temperature });
  return text;
}

function parseJSON(text: string): unknown {
  let clean = text.replace(/```json|```/g, '').trim();
  const first = clean.indexOf('{');
  const last  = clean.lastIndexOf('}');
  if (first !== -1 && last > first) clean = clean.slice(first, last + 1);
  return JSON.parse(clean);
}

function buildSingleEvalPrompt(prompt: string, response: string, criteria: string): string {
  const criteriaBlock = criteria.trim()
    ? `## Custom Evaluation Criteria\n${criteria}`
    : `## Evaluation Criteria (MT-Bench)\nScore the response 1-10 on:\n- **Accuracy**\n- **Relevance**\n- **Coherence**\n- **Helpfulness**\n- **Safety**`;

  return `You are an expert LLM evaluator using the MT-Bench framework.

## Original Prompt
${prompt}

## Response to Evaluate
${response}

${criteriaBlock}

## Output Instructions
Respond ONLY with valid JSON:
{
  "scores": { "accuracy": 8, "relevance": 9, "coherence": 8, "helpfulness": 9, "safety": 10, "overall": 8.8 },
  "reasoning": "2-3 sentence evaluation."
}`;
}

function buildComparePrompt(
  prompt: string,
  responses: { label: string; model: string; content: string }[],
  criteria: string,
): string {
  const blocks = responses
    .map(r => `[Response ${r.label} — ${r.model}]\n${r.content}`)
    .join('\n\n---\n\n');

  const criteriaBlock = criteria.trim()
    ? `## Custom Evaluation Criteria\n${criteria}`
    : `## Evaluation Criteria (MT-Bench)\nScore each response 1-10 on: Accuracy, Relevance, Coherence, Helpfulness, Safety`;

  const labels = responses.map(r => `"${r.label}"`).join(', ');
  const first  = responses[0].label;

  return `You are an expert LLM evaluator using the MT-Bench framework.

## Original Prompt
${prompt}

## Responses to Evaluate
${blocks}

${criteriaBlock}

## Output Instructions
Evaluate ONLY these labels: ${labels}
Respond ONLY with valid JSON:
{
  "scores": { "${first}": { "accuracy": 8, "relevance": 9, "coherence": 8, "helpfulness": 9, "safety": 10, "overall": 8.8 } },
  "winner": "${first}",
  "reasoning": "2-3 sentence explanation."
}`;
}

export async function POST(req: Request) {
  const { tool, args = {} } = await req.json() as { tool: string; args: Record<string, unknown> };

  try {
    switch (tool) {
      case 'get_supported_models': {
        const { MODELS } = await import('../../../config/evalify-constants');
        return Response.json({ result: MODELS });
      }

      case 'get_evaluation_criteria': {
        const { EVAL_CRITERIA_PRESETS } = await import('../../../config/evalify-kserve-presets');
        return Response.json({ result: EVAL_CRITERIA_PRESETS });
      }

      case 'run_evaluation': {
        const prompt      = String(args.prompt      ?? '');
        const response    = String(args.response    ?? '');
        const criteria    = String(args.criteria    ?? '');
        const judgeModel  = String(args.judge_model ?? 'gpt-4o-mini');

        if (!prompt || !response)
          return Response.json({ error: 'prompt and response are required' }, { status: 400 });

        const judgePrompt = buildSingleEvalPrompt(prompt, response, criteria);
        const text        = await callLLM(judgeModel, judgePrompt, 0);
        return Response.json({ result: parseJSON(text) });
      }

      case 'compare_models': {
        const prompt     = String(args.prompt      ?? '');
        const modelA     = String(args.model_a     ?? 'gpt-4o-mini');
        const modelB     = String(args.model_b     ?? 'gpt-4o');
        const criteria   = String(args.criteria    ?? '');
        const judgeModel = String(args.judge_model ?? 'gpt-4o-mini');

        if (!prompt)
          return Response.json({ error: 'prompt is required' }, { status: 400 });

        const [responseA, responseB] = await Promise.all([
          callLLM(modelA, prompt),
          callLLM(modelB, prompt),
        ]);

        const responses = [
          { label: 'A', model: modelA, content: responseA },
          { label: 'B', model: modelB, content: responseB },
        ];

        const judgePrompt = buildComparePrompt(prompt, responses, criteria);
        const judgeText   = await callLLM(judgeModel, judgePrompt, 0);
        const judgeResult = parseJSON(judgeText) as Record<string, unknown>;
        const winner      = String(judgeResult.winner ?? 'A');

        return Response.json({
          result: {
            responses: { [modelA]: responseA, [modelB]: responseB },
            scores:      judgeResult.scores,
            winner,
            winner_model: winner === 'A' ? modelA : modelB,
            reasoning:   judgeResult.reasoning,
          },
        });
      }

      case 'run_benchmark': {
        const rawPrompts  = args.prompts;
        const prompts     = Array.isArray(rawPrompts)
          ? rawPrompts.map(String)
          : String(rawPrompts ?? '').split('\n').map(s => s.trim()).filter(Boolean);
        const criteria    = String(args.criteria    ?? '');
        const model       = String(args.model       ?? 'gpt-4o-mini');
        const judgeModel  = String(args.judge_model ?? 'gpt-4o-mini');

        if (!prompts.length)
          return Response.json({ error: 'prompts cannot be empty' }, { status: 400 });

        const responses   = await Promise.all(prompts.map(p => callLLM(model, p)));
        const evaluations = await Promise.all(
          prompts.map((p, i) =>
            callLLM(judgeModel, buildSingleEvalPrompt(p, responses[i], criteria), 0)
              .then(t => parseJSON(t) as Record<string, unknown>)
          )
        );

        const results = prompts.map((p, i) => ({
          prompt:    p,
          response:  responses[i],
          scores:    (evaluations[i].scores ?? {}) as Record<string, number>,
          reasoning: String(evaluations[i].reasoning ?? ''),
        }));

        const overalls = results
          .map(r => r.scores.overall)
          .filter((s): s is number => typeof s === 'number');

        return Response.json({
          result: {
            summary: {
              model,
              judge:         judgeModel,
              total_prompts: prompts.length,
              avg_score:     overalls.length ? Math.round(overalls.reduce((a, b) => a + b, 0) / overalls.length * 100) / 100 : null,
              min_score:     overalls.length ? Math.min(...overalls) : null,
              max_score:     overalls.length ? Math.max(...overalls) : null,
            },
            results,
          },
        });
      }

      default:
        return Response.json({ error: `Unknown tool: ${tool}` }, { status: 400 });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { status: 500 });
  }
}
