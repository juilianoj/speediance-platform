'use server';

import {
  BedrockRuntimeClient,
  ConverseCommand,
  type ConverseCommandInput,
  type ContentBlock,
  type Message,
  type Tool,
  type ToolResultContentBlock,
} from '@aws-sdk/client-bedrock-runtime';

import { verifyIdTokenFromCookies } from '@/lib/auth/session';

import { COACH_TOOLS, runTool, type ToolName } from './tools';

// Bedrock cross-region inference profile for Claude Sonnet 4.6. The "us."
// prefix routes through the US inference profile which gives better
// availability than a single-region model id. The actual model ARN is
// resolved by Bedrock at invoke time.
const MODEL_ID = process.env.BEDROCK_MODEL_ID ?? 'us.anthropic.claude-sonnet-4-20250514-v1:0';
const REGION = process.env.AWS_REGION ?? 'us-west-2';
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
 * One round of conversation against Bedrock's Converse API. The model gets
 * the full history plus the tool spec, and may call tools up to
 * MAX_TOOL_ITERATIONS times before the server returns a final reply.
 *
 * Bedrock authenticates via the Lambda's IAM role (`bedrock:InvokeModel`),
 * so there's no API key to manage. Region is the same as the rest of the
 * stack — us-west-2 has Claude Sonnet 4 available via the cross-region
 * inference profile.
 */
export async function askCoach(
  history: CoachMessage[],
  question: string,
): Promise<AskResult | AskError> {
  const claims = await verifyIdTokenFromCookies();
  if (!claims) return { ok: false, message: 'Sign in to chat.' };

  const client = new BedrockRuntimeClient({ region: REGION });
  const toolsUsed: ToolName[] = [];

  const messages: Message[] = [
    ...history.map((m) => ({
      role: m.role,
      content: [{ text: m.content }],
    })),
    { role: 'user', content: [{ text: question }] },
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
    'When recommending a next-session weight, default progression rules:',
    '• If the last working set hit all target reps with no form flags, +5 lb',
    '  for compound lifts, +2.5 lb for isolation / single-arm work.',
    '• If reps fell short OR form flags are present, hold the weight.',
    '• If the user is at a fresh PR, suggest holding for 1–2 sessions before',
    '  pushing.',
    '',
    "Today's date: " + new Date().toISOString().slice(0, 10),
  ].join('\n');

  for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter++) {
    const input: ConverseCommandInput = {
      modelId: MODEL_ID,
      system: [{ text: systemPrompt }],
      messages,
      inferenceConfig: { maxTokens: 1024, temperature: 0.4 },
      toolConfig: {
        // Bedrock's discriminated `Tool` union has an implicit `$unknown`
        // variant for forward compatibility — cast through unknown so we
        // don't have to fabricate it. The shape matches at runtime.
        tools: COACH_TOOLS.map(
          (t) =>
            ({
              toolSpec: {
                name: t.name,
                description: t.description,
                inputSchema: { json: t.input_schema },
              },
            }) as unknown as Tool,
        ),
      },
    };

    let resp;
    try {
      resp = await client.send(new ConverseCommand(input));
    } catch (err) {
      console.error('Bedrock Converse failed', err);
      const raw = err instanceof Error ? err.message : 'Bedrock call failed';
      // Most likely first-time-setup error: AWS requires submitting an
      // Anthropic use-case form per account before invoking Claude on
      // Bedrock. Translate the raw message into something actionable.
      if (/use case details have not been submitted/i.test(raw)) {
        return {
          ok: false,
          message:
            'Bedrock requires a one-time use-case form before Anthropic models can be invoked from this AWS account. Submit it at https://us-west-2.console.aws.amazon.com/bedrock/home?region=us-west-2#/modelaccess and try again in ~15 minutes.',
        };
      }
      if (/AccessDenied|not authorized/i.test(raw)) {
        return {
          ok: false,
          message:
            "Bedrock denied the request. Check the Lambda's IAM role has `bedrock:InvokeModel` and that the configured model is approved for this account.",
        };
      }
      return { ok: false, message: `Coach error: ${raw}` };
    }

    const out = resp.output?.message;
    if (!out) return { ok: false, message: 'Bedrock returned no message.' };

    if (resp.stopReason === 'tool_use') {
      messages.push(out);
      const toolResults: ContentBlock[] = [];
      for (const block of out.content ?? []) {
        if (block.toolUse) {
          const tname = block.toolUse.name as ToolName;
          const tuseId = block.toolUse.toolUseId ?? 'unknown';
          toolsUsed.push(tname);
          try {
            const result = await runTool(
              claims.sub,
              tname,
              (block.toolUse.input ?? {}) as Record<string, unknown>,
            );
            const content: ToolResultContentBlock[] = [{ json: result as never }];
            toolResults.push({
              toolResult: {
                toolUseId: tuseId,
                content,
                status: 'success',
              },
            });
          } catch (err) {
            toolResults.push({
              toolResult: {
                toolUseId: tuseId,
                content: [{ text: err instanceof Error ? err.message : 'tool failed' }],
                status: 'error',
              },
            });
          }
        }
      }
      messages.push({ role: 'user', content: toolResults });
      continue;
    }

    const text = (out.content ?? [])
      .map((b) => b.text ?? '')
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
