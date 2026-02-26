import { v4 as uuidv4 } from 'uuid';

import type {
  ChatEvent,
  ChatMessage,
  ChatTurnInput,
  CodeChangeSet,
  CommandProposal,
  FilePatch,
  Result
} from '../../shared/contracts';

import { DatabaseService } from './databaseService';
import { ok } from './errors';
import { PatchService } from './patchService';
import { SettingsService } from './settingsService';
import { ShellService } from './shellService';
import { WorkspaceService } from './workspaceService';

interface ParsedAssistantPayload {
  assistantMessage: string;
  filePatches: Array<{ path: string; new_content: string; expected_sha256?: string }>;
  commands: Array<{ command: string; cwd?: string }>;
}

const SYSTEM_PROMPT = `You are an AI coding assistant in a desktop IDE.
Respond using JSON only with this schema:
{
  "assistant_message": "brief explanation",
  "file_patches": [
    {
      "path": "relative/path/from/workspace",
      "new_content": "full replacement content for the file",
      "expected_sha256": "optional existing file hash"
    }
  ],
  "commands": [
    {
      "command": "shell command",
      "cwd": "."
    }
  ]
}
Rules:
- Keep assistant_message concise.
- Use file_patches only when explicitly asked to change code.
- Use commands only when they are clearly useful.
- Do not include markdown fences or extra text outside JSON.`;

const JSON_OBJECT_REGEX = /\{[\s\S]*\}/m;

const tryParseJsonObject = <T>(raw: string): T | null => {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  try {
    return JSON.parse(trimmed) as T;
  } catch {
    const match = trimmed.match(JSON_OBJECT_REGEX);
    if (!match) {
      return null;
    }

    try {
      return JSON.parse(match[0]) as T;
    } catch {
      return null;
    }
  }
};

const parseAssistantPayload = (rawText: string): ParsedAssistantPayload => {
  const parsed = tryParseJsonObject<{
    assistant_message?: unknown;
    file_patches?: unknown;
    commands?: unknown;
  }>(rawText);

  if (!parsed) {
    return {
      assistantMessage: rawText.trim(),
      filePatches: [],
      commands: []
    };
  }

  const filePatches = Array.isArray(parsed.file_patches)
    ? parsed.file_patches
        .filter((item): item is { path?: unknown; new_content?: unknown; expected_sha256?: unknown } =>
          Boolean(item && typeof item === 'object')
        )
        .map((item) => ({
          path: String(item.path ?? ''),
          new_content: String(item.new_content ?? ''),
          expected_sha256:
            typeof item.expected_sha256 === 'string' && item.expected_sha256.length > 0
              ? item.expected_sha256
              : undefined
        }))
        .filter((item) => item.path.length > 0)
    : [];

  const commands = Array.isArray(parsed.commands)
    ? parsed.commands
        .filter((item): item is { command?: unknown; cwd?: unknown } => Boolean(item && typeof item === 'object'))
        .map((item) => ({
          command: String(item.command ?? ''),
          cwd: typeof item.cwd === 'string' && item.cwd.length > 0 ? item.cwd : '.'
        }))
        .filter((item) => item.command.length > 0)
    : [];

  const assistantMessage =
    typeof parsed.assistant_message === 'string' && parsed.assistant_message.trim().length > 0
      ? parsed.assistant_message.trim()
      : rawText.trim();

  return {
    assistantMessage,
    filePatches,
    commands
  };
};

export class AIService {
  constructor(
    private readonly settingsService: SettingsService,
    private readonly workspaceService: WorkspaceService,
    private readonly patchService: PatchService,
    private readonly shellService: ShellService,
    private readonly database: DatabaseService
  ) {}

  startChatTurn(input: ChatTurnInput, emitEvent: (event: ChatEvent) => void): Result<{ turnId: string }> {
    const turnId = uuidv4();
    void this.executeTurn(turnId, input, emitEvent);
    return ok({ turnId });
  }

  private async executeTurn(turnId: string, input: ChatTurnInput, emitEvent: (event: ChatEvent) => void): Promise<void> {
    const createdAt = new Date().toISOString();
    const userMessage: ChatMessage = {
      id: uuidv4(),
      sessionId: input.sessionId,
      role: 'user',
      content: input.prompt,
      createdAt
    };

    this.database.safeCall(() => this.database.saveMessage(userMessage));

    const keyResult = await this.settingsService.getOpenAIKey();
    if (!keyResult.ok) {
      emitEvent({ type: 'error', turnId, error: keyResult.error });
      emitEvent({ type: 'done', turnId });
      return;
    }

    const settings = this.settingsService.getSettings();

    const contextPaths = Array.from(
      new Set([input.activeFilePath, ...input.selectedFilePaths].filter((value): value is string => Boolean(value)))
    ).slice(0, input.maxContextFiles || settings.maxContextFiles);

    const contextFiles = await this.workspaceService.readFilesForContext(contextPaths);
    const contextText = contextFiles
      .map((file) => `File: ${file.path}\nSHA256: ${file.sha256}\n\n${file.content}`)
      .join('\n\n---\n\n');

    const userPrompt = `User request:\n${input.prompt}\n\nContext files:\n${contextText || '(none)'}`;

    let outputText = '';

    try {
      const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${keyResult.value}`
        },
        body: JSON.stringify({
          model: settings.model,
          temperature: settings.temperature,
          stream: true,
          input: [
            {
              role: 'system',
              content: [
                {
                  type: 'input_text',
                  text: SYSTEM_PROMPT
                }
              ]
            },
            {
              role: 'user',
              content: [
                {
                  type: 'input_text',
                  text: userPrompt
                }
              ]
            }
          ]
        })
      });

      if (!response.ok || !response.body) {
        const details = await response.text();
        emitEvent({
          type: 'error',
          turnId,
          error: {
            code: 'OPENAI_REQUEST_FAILED',
            message: 'OpenAI request failed',
            details
          }
        });
        emitEvent({ type: 'done', turnId });
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      const handleEventData = (payload: string) => {
        if (payload === '[DONE]') {
          return;
        }

        try {
          const event = JSON.parse(payload) as Record<string, unknown>;
          if (event.type === 'response.output_text.delta' && typeof event.delta === 'string') {
            outputText += event.delta;
            emitEvent({ type: 'token', turnId, token: event.delta });
            return;
          }

          if (event.type === 'response.output_text.done' && typeof event.text === 'string') {
            outputText = event.text;
            return;
          }

          if (event.type === 'response.completed' && typeof event.response === 'object' && event.response !== null) {
            const responseObj = event.response as Record<string, unknown>;
            if (!outputText && typeof responseObj.output_text === 'string') {
              outputText = responseObj.output_text;
            }
          }
        } catch {
          // Ignore malformed stream chunks.
        }
      };

      for (;;) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });

        let boundary = buffer.indexOf('\n\n');
        while (boundary !== -1) {
          
          const block = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);

          const lines = block
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => line.startsWith('data:'));

          for (const line of lines) {
            handleEventData(line.slice('data:'.length).trim());
          }

          boundary = buffer.indexOf('\n\n');
        }
      }

      const parsed = parseAssistantPayload(outputText);
      const assistantMessage: ChatMessage = {
        id: uuidv4(),
        sessionId: input.sessionId,
        role: 'assistant',
        content: parsed.assistantMessage || 'Done.',
        createdAt: new Date().toISOString()
      };

      this.database.safeCall(() => this.database.saveMessage(assistantMessage));
      emitEvent({ type: 'assistant_message', turnId, message: assistantMessage });

      const commandProposals: CommandProposal[] = [];
      for (const proposedCommand of parsed.commands) {
        const proposalResult = this.shellService.requestCommand(
          input.sessionId,
          proposedCommand.command,
          proposedCommand.cwd ?? '.'
        );

        if (proposalResult.ok) {
          commandProposals.push(proposalResult.value);
          emitEvent({ type: 'proposed_command', turnId, command: proposalResult.value });
        }
      }

      const patchCandidates: FilePatch[] = [];
      for (const candidate of parsed.filePatches) {
        const existing = await this.workspaceService.readFile(candidate.path);
        if (existing.ok) {
          patchCandidates.push({
            path: candidate.path,
            originalContent: existing.value.content,
            newContent: candidate.new_content,
            expectedSha256: candidate.expected_sha256 ?? existing.value.sha256
          });
          continue;
        }

        patchCandidates.push({
          path: candidate.path,
          originalContent: '',
          newContent: candidate.new_content,
          expectedSha256: candidate.expected_sha256
        });
      }

      if (patchCandidates.length > 0) {
        const changeSet: CodeChangeSet = {
          id: uuidv4(),
          sessionId: input.sessionId,
          source: 'ai',
          summary: parsed.assistantMessage.slice(0, 140),
          createdAt: new Date().toISOString(),
          status: 'pending',
          filePatches: patchCandidates,
          proposedCommands: commandProposals
        };

        const registerResult = this.patchService.registerChangeSet(changeSet);
        if (registerResult.ok) {
          emitEvent({ type: 'proposed_patch', turnId, changeSet });
        } else {
          emitEvent({ type: 'error', turnId, error: registerResult.error });
        }
      }
    } catch (error) {
      emitEvent({
        type: 'error',
        turnId,
        error: {
          code: 'OPENAI_REQUEST_FAILED',
          message: 'Failed while processing OpenAI stream',
          details: error instanceof Error ? error.message : error
        }
      });
    }

    emitEvent({ type: 'done', turnId });
  }
}
