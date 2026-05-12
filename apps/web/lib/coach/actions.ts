'use server';

import Anthropic from '@anthropic-ai/sdk';

import { verifyIdTokenFromCookies } from '@/lib/auth/session';

import { COACH_TOOLS, runTool, type ToolName } from './tools';

const MODEL = 'claude-sonnet-4-6';
const MAX_TOOL_ITERATIONS = 6;

export interface CoachMessage {
  role: 'user' | 'assistant';
  content: string;
  /** Optional per-turn trace — tool names called for transparency. */
  toolsUsed?: ToolName[];
}

interface AskResult {
  ok: true;
  reply: string;
  toolsUsed: ToolName[];
}

interface AskError {
  ok: false;
  message: string;
}

/**
 * One round of conversation. The model gets the full history plus the tool
 * spec, and may call tools up to MAX_TOOL_ITERATIONS times before the
 * server returns a final reply. We don't stream — the chat is server-
 * rendered with a refresh on each turn, which keeps the Lambda dumb and
 * avoids long-poll connections.
 */
export async function askCoach(
  history: CoachMessage[],
  question: string,
): Promise<AskResult | AskError> {
  const claims = await verifyIdTokenFromCookies();
  if (!claims) return { ok: false, message: 'Sign in to chat.' };
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      message:
        'Coach is not configured yet. The ANTHROPIC_API_KEY env var is missing on the Lambda. Set it in SST and redeploy.',
    };
  }

  const client = new Anthropic({ apiKey });
  // Build messages from prior history + new question.
  const messages: Anthropic.MessageParam[] = [
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: 'user' as const, content: question },
  ];

  const systemPrompt = [
    "You are the user's personal training coach. They train on a Speediance",
    'machine, and the database has their workout history. Answer in plain',
    'English, concise (2–4 sentences for most questions). Round weights to',
    'sensible precision. When citing a date use the user-friendly format',
    '(e.g. "May 11"), not the raw ISO. Always call tools before answering',
    "factual questions about the user's training — never guess at numbers.",
    'If you cannot answer with the tools provided, say so plainly.',
    '',
    "Today's date: " + new Date().toISOString().slice(0, 10),
  ].join('\n');

  const toolsUsed: ToolName[] = [];

  for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter++) {
    const resp = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: systemPrompt,
      tools: COACH_TOOLS as unknown as Anthropic.Tool[],
      messages,
    });

    if (resp.stop_reason === 'tool_use') {
      // Collect the assistant's tool-use turn into history, then resolve
      // each tool_use block and feed the results back.
      messages.push({ role: 'assistant', content: resp.content });
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of resp.content) {
        if (block.type === 'tool_use') {
          const tname = block.name as ToolName;
          toolsUsed.push(tname);
          try {
            const result = await runTool(claims.sub, tname, block.input as Record<string, unknown>);
            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: JSON.stringify(result),
            });
          } catch (err) {
            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id,
              is_error: true,
              content: err instanceof Error ? err.message : 'tool failed',
            });
          }
        }
      }
      messages.push({ role: 'user', content: toolResults });
      continue;
    }

    // Terminal — assistant returned text. Concat all text blocks.
    const text = resp.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();
    return { ok: true, reply: text || '(no answer)', toolsUsed };
  }

  return {
    ok: false,
    message:
      'Coach hit the tool-call limit without arriving at a final answer. Try rephrasing or asking something narrower.',
  };
}
