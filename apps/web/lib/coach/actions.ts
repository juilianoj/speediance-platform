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
import { createDb } from '@speediance/db';

import { verifyIdTokenFromCookies } from '@/lib/auth/session';

import { loadCoachContext, renderCoachContextBlock } from './load-context';
import { queueWriteTool, WRITE_TOOLS, type ProposedAction } from './plan';
import { COACH_TOOLS, runTool, type ToolName } from './tools';

// Bedrock cross-region inference profile for Claude Sonnet 4.6. The "us."
// prefix routes through the US inference profile which gives better
// availability than a single-region model id. The actual model ARN is
// resolved by Bedrock at invoke time.
const MODEL_ID = process.env.BEDROCK_MODEL_ID ?? 'us.anthropic.claude-sonnet-4-20250514-v1:0';
const REGION = process.env.AWS_REGION ?? 'us-west-2';
// Each iteration is one Bedrock round-trip; a single iteration can drive
// multiple parallel tool_use blocks. "Build me a workout" prompts have
// hit the cap at 6 by burning iterations on exploratory catalog searches.
// 10 gives the model headroom; the 60s Lambda timeout is the real outer
// bound and per-iter latency stays sub-second for the data tools.
const MAX_TOOL_ITERATIONS = 10;

export interface CoachMessage {
  role: 'user' | 'assistant';
  content: string;
  /** Optional per-turn trace — tool names called for transparency. */
  toolsUsed?: ToolName[];
  /** Write-side actions the assistant queued during this turn. The drawer
   *  renders them as a plan card with an Approve / Cancel control. */
  proposedActions?: ProposedAction[];
  /** Status of the plan card (set client-side after the user interacts). */
  planStatus?: 'pending' | 'running' | 'done' | 'failed' | 'cancelled';
  /** Per-action execution results, populated after `executePlan` runs. */
  planResults?: Array<{ id: string; ok: boolean; error?: string }>;
}

interface AskResult {
  ok: true;
  reply: string;
  toolsUsed: ToolName[];
  /** Write-side actions the agent decided to take, deferred until the
   *  user approves them via the plan card in the drawer. */
  proposedActions: ProposedAction[];
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

  // Per-turn audit (roadmap §4.7 v2) — captures tokens + duration for
  // the /admin Bedrock-spend roll-up. Filled in across the loop;
  // flushed once on every exit path (success or AskError).
  const startedAt = new Date().toISOString();
  const startMs = Date.now();
  const audit = { inputTokens: 0, outputTokens: 0, iterations: 0 };
  const flushAudit = async (ok: boolean) => {
    const tableName = process.env.DYNAMO_TABLE_NAME;
    if (!tableName) return;
    try {
      const me = createDb({ tableName }).forUser(claims.sub);
      await me.coachInvocations.put({
        startedAt,
        finishedAt: new Date().toISOString(),
        modelId: MODEL_ID,
        inputTokens: audit.inputTokens,
        outputTokens: audit.outputTokens,
        iterations: audit.iterations,
        durationMs: Date.now() - startMs,
        ok,
        toolsUsed: toolsUsed.join(',').slice(0, 1024),
      });
    } catch (err) {
      // Audit is best-effort — losing one row is far less bad than
      // failing the user-facing turn because the audit write blew up.
      console.warn('coachInvocation audit write failed', err);
    }
  };

  const client = new BedrockRuntimeClient({ region: REGION });
  const toolsUsed: ToolName[] = [];
  // Per-turn queue of write-side actions the agent decided to take.
  // Read tools execute inline (the agent needs real data to reason),
  // but anything that mutates DDB or hits the Speediance write API
  // accumulates here and surfaces to the user as a plan they have to
  // approve before anything actually happens.
  const proposedActions: ProposedAction[] = [];

  const coachContext = await loadCoachContext(claims.sub);
  const userContextBlock = renderCoachContextBlock(coachContext);

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
    'FORMATTING: every reply renders as markdown in the assistant drawer.',
    'When you mention an internal URL — `/builder/{id}`, `/builder/programs/{id}`,',
    '`/scheduled/{date}`, `/profile`, `/lift-log`, `/exercises/{id}`, etc. — ',
    'ALWAYS write it as a markdown link: `[/builder/abc123](/builder/abc123)`,',
    'so the drawer renders it as a clickable link. Plain text URLs look broken.',
    '',
    'When recommending a next-session weight, default progression rules:',
    '• If the last working set hit all target reps with no form flags, +5 lb',
    '  for compound lifts, +2.5 lb for isolation / single-arm work.',
    '• If reps fell short OR form flags are present, hold the weight.',
    '• If the user is at a fresh PR, suggest holding for 1–2 sessions before',
    '  pushing.',
    '',
    'HARD SAFETY CAP: never propose a weight greater than',
    'min(1.05 × bestWeight, 1.15 × workingWeight) for any exercise the user',
    'has history on. The server enforces this in code and will silently clamp',
    'oversized weights before they hit the draft — so if you try to push',
    'above the cap, the draft will save with a smaller weight than you asked',
    "for. Don't fight it.",
    '',
    'PLAN-AND-CONFIRM: every write-side tool you call (create / update /',
    'schedule / unschedule workouts and programs) is QUEUED, not executed.',
    'The server returns a synthetic `{ ok: true, queued: true, … }` result',
    'so you can keep reasoning and chain steps (e.g. create a workout draft,',
    'then a program that references its draftId, then schedule the program).',
    'The user sees a plan card in the drawer with every queued action and',
    'has to click Approve before anything actually saves to DDB or pushes',
    'to Speediance. Your final reply should END with a one-line summary of',
    'what the plan does — e.g. "I queued 1 workout + 1 program + a schedule',
    'push starting Monday." Then stop. Don\'t pre-celebrate ("Done!") —',
    "the actions haven't run yet.",
    '',
    'When the user asks you to build / plan / draft / create a SINGLE workout,',
    'USE the builder tools — never just describe it in prose:',
    '• Start with list_catalog_exercises to find the actual groupIds for the',
    "  exercises you have in mind. Don't invent ids.",
    '• Prefer get_balance_gaps + get_plateau_lifts to bias your picks toward',
    "  what the user actually needs (don't bias by what you'd pick blindly).",
    '• Be decisive: cap yourself at 2–3 catalog searches across all muscle',
    '  groups you need. If a search returns no perfect match, take a',
    '  reasonable substitute from the results rather than searching again —',
    '  the user reviews the draft and can swap exercises in the builder.',
    '• Group exercises that share equipment (same cable position, same',
    "  attachment) so the user doesn't shuffle the device mid-workout.",
    '• Call create_workout_draft to save the workout. Reply with a short',
    "  summary of what's in the draft + the /builder URL — DON'T paste the",
    '  full exercise list in chat, the user will see it on the builder page.',
    '• For modifications to an existing draft: use list_workout_drafts +',
    '  get_workout_draft to find it, then update_workout_draft.',
    '',
    'PROFILE EDITS: when the user asks to update their weight, training',
    'goal, session length, units, equipment constraints, or any other',
    'profile preference, call `update_profile` with just the fields they',
    "want changed. (It can't touch credentials, MCP keys, or Speediance",
    'email/password — those go through the /profile form.) Like every',
    'other write tool, the change is queued in the plan card and only',
    'lands after the user approves.',
    '',
    'PUSHING TO SPEEDIANCE: once a workout draft is created, you can put',
    "it on the user's Speediance machine by calling",
    'push_draft_to_speediance(draftId). This makes the workout show up as',
    'a custom training template in the mobile app, ready to schedule or',
    'start from the device. Only do this when the user explicitly asks',
    '("save it", "push to Speediance", "send it to my app", "put it on my',
    'Speediance"). Otherwise leave it as draft — they can push from',
    '/builder themselves. unsave_draft_from_speediance(draftId) reverses',
    'it.',
    '',
    'When the user asks for a MULTI-WEEK program (split, training cycle,',
    'phase, etc.):',
    '• First, create each distinct workout in the program via',
    '  create_workout_draft (usually 3-5 sessions per week — e.g. Push, Pull,',
    "  Legs, Upper). Don't reference workouts that don't exist yet.",
    '• Then call create_program_draft with a slots[] array that lists which',
    '  workout draftId runs on which (weekIndex, dayOfWeek). dayOfWeek is',
    '  0=Sun..6=Sat. Most programs repeat the same week pattern across all',
    '  weekCount weeks — generate the slots accordingly.',
    '• Reply with a short summary + the /builder/programs URL. If the user',
    '  asked to schedule it, also call schedule_program with the date they',
    '  picked (default to next Monday if unclear and ask first).',
    '',
    "Today's date: " + new Date().toISOString().slice(0, 10),
    ...(userContextBlock ? ['', userContextBlock] : []),
  ].join('\n');

  for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter++) {
    audit.iterations = iter + 1;
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
        await flushAudit(false);
        return {
          ok: false,
          message:
            'Bedrock requires a one-time use-case form before Anthropic models can be invoked from this AWS account. Submit it at https://us-west-2.console.aws.amazon.com/bedrock/home?region=us-west-2#/modelaccess and try again in ~15 minutes.',
        };
      }
      if (/AccessDenied|not authorized/i.test(raw)) {
        await flushAudit(false);
        return {
          ok: false,
          message:
            "Bedrock denied the request. Check the Lambda's IAM role has `bedrock:InvokeModel` and that the configured model is approved for this account.",
        };
      }
      await flushAudit(false);
      return { ok: false, message: `Coach error: ${raw}` };
    }

    // Accumulate Bedrock-reported usage across iterations so the audit
    // row reflects the whole turn, not just the last Converse call.
    if (resp.usage) {
      audit.inputTokens += resp.usage.inputTokens ?? 0;
      audit.outputTokens += resp.usage.outputTokens ?? 0;
    }

    const out = resp.output?.message;
    if (!out) {
      await flushAudit(false);
      return { ok: false, message: 'Bedrock returned no message.' };
    }

    if (resp.stopReason === 'tool_use') {
      messages.push(out);
      const toolResults: ContentBlock[] = [];
      for (const block of out.content ?? []) {
        if (block.toolUse) {
          const tname = block.toolUse.name as ToolName;
          const tuseId = block.toolUse.toolUseId ?? 'unknown';
          const toolArgs = (block.toolUse.input ?? {}) as Record<string, unknown>;
          toolsUsed.push(tname);
          try {
            // Write tools are queued for user approval; read tools execute
            // inline so the agent has real data to reason against.
            const result = WRITE_TOOLS.has(tname)
              ? queueWriteTool(tname, toolArgs, proposedActions)
              : await runTool(claims.sub, tname, toolArgs);
            // Bedrock's tool_result `json` field MUST be a JSON object
            // (not an array). Wrap raw arrays in { items: [...] } so the
            // model still gets clean structured input regardless of what
            // our tool returns. The model sees the structure either way.
            const wrapped = Array.isArray(result)
              ? { items: result }
              : (result as Record<string, unknown>);
            const content: ToolResultContentBlock[] = [{ json: wrapped as never }];
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
    await flushAudit(true);
    return {
      ok: true,
      reply: text || '(no answer)',
      toolsUsed,
      proposedActions,
    };
  }

  await flushAudit(false);
  return {
    ok: false,
    message:
      'Coach hit the tool-call limit without arriving at a final answer. Try rephrasing or asking something narrower.',
  };
}
