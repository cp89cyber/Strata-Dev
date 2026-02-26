import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

import { v4 as uuidv4 } from 'uuid';

import type { CommandOutputEvent, CommandProposal, CommandRunHandle, Result } from '../../shared/contracts';

import { DatabaseService } from './databaseService';
import { err, ok, toAppError } from './errors';
import { isWithinRoot } from './security';
import { WorkspaceService } from './workspaceService';

interface ProposalRecord {
  proposal: CommandProposal;
  absCwd: string;
}

export class ShellService {
  private readonly proposals = new Map<string, ProposalRecord>();
  private readonly outputEmitter = new EventEmitter();

  constructor(
    private readonly workspaceService: WorkspaceService,
    private readonly database: DatabaseService
  ) {}

  onOutput(listener: (sessionId: string, event: CommandOutputEvent) => void): () => void {
    this.outputEmitter.on('output', listener);
    return () => this.outputEmitter.off('output', listener);
  }

  requestCommand(sessionId: string, command: string, cwd: string): Result<CommandProposal> {
    const workspace = this.workspaceService.currentWorkspace;
    if (!workspace) {
      return err('WORKSPACE_NOT_OPEN', 'Open a workspace before executing commands');
    }

    const absCwdCandidate = path.resolve(workspace.rootPath, cwd);
    if (!isWithinRoot(workspace.rootPath, absCwdCandidate)) {
      return err('PATH_OUTSIDE_WORKSPACE', `Command cwd must be inside workspace: ${cwd}`);
    }

    let absCwd = absCwdCandidate;
    try {
      absCwd = fs.realpathSync(absCwdCandidate);
      const stat = fs.statSync(absCwd);
      if (!stat.isDirectory()) {
        return err('INVALID_INPUT', `Command cwd must be a directory: ${cwd}`);
      }
    } catch {
      return err('INVALID_INPUT', `Command cwd does not exist: ${cwd}`);
    }

    if (!isWithinRoot(workspace.rootPath, absCwd)) {
      return err('PATH_OUTSIDE_WORKSPACE', `Command cwd resolves outside workspace: ${cwd}`);
    }

    const proposal: CommandProposal = {
      id: uuidv4(),
      sessionId,
      command,
      cwd,
      createdAt: new Date().toISOString(),
      decision: 'pending'
    };

    this.proposals.set(proposal.id, { proposal, absCwd });
    return ok(proposal);
  }

  async runCommand(proposalId: string, confirmed: true): Promise<Result<CommandRunHandle>> {
    if (!confirmed) {
      return err('COMMAND_DENIED', 'Command execution requires explicit confirmation');
    }

    const record = this.proposals.get(proposalId);
    if (!record) {
      return err('COMMAND_NOT_FOUND', `Unknown command proposal: ${proposalId}`);
    }

    const { proposal, absCwd } = record;
    const workspace = this.workspaceService.currentWorkspace;
    if (!workspace || !isWithinRoot(workspace.rootPath, absCwd)) {
      return err('PATH_OUTSIDE_WORKSPACE', 'Command cwd is no longer valid for active workspace');
    }

    proposal.decision = 'approved';

    const runId = uuidv4();
    const startedAt = new Date().toISOString();

    this.database.safeCall(() =>
      this.database.saveCommandRun(runId, proposal.sessionId, {
        proposal,
        startedAt,
        status: 'running'
      })
    );

    try {
      const child = spawn('bash', ['-lc', proposal.command], {
        cwd: absCwd,
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe']
      });

      const emitOutput = (event: CommandOutputEvent) => {
        this.database.safeCall(() => this.database.saveCommandOutput(proposal.sessionId, event));
        this.outputEmitter.emit('output', proposal.sessionId, event);
      };

      child.stdout.on('data', (chunk) => {
        emitOutput({
          runId,
          stream: 'stdout',
          chunk: chunk.toString('utf-8'),
          timestamp: new Date().toISOString()
        });
      });

      child.stderr.on('data', (chunk) => {
        emitOutput({
          runId,
          stream: 'stderr',
          chunk: chunk.toString('utf-8'),
          timestamp: new Date().toISOString()
        });
      });

      child.on('close', (code) => {
        emitOutput({
          runId,
          stream: 'exit',
          code: typeof code === 'number' ? code : 1,
          timestamp: new Date().toISOString()
        });

        this.database.safeCall(() =>
          this.database.saveCommandRun(runId, proposal.sessionId, {
            proposal,
            startedAt,
            finishedAt: new Date().toISOString(),
            status: 'completed',
            code: typeof code === 'number' ? code : 1
          })
        );
      });

      child.on('error', (error) => {
        emitOutput({
          runId,
          stream: 'stderr',
          chunk: error.message,
          timestamp: new Date().toISOString()
        });
      });

      return ok({
        runId,
        proposalId,
        startedAt
      });
    } catch (error) {
      return err('COMMAND_EXECUTION_FAILED', 'Unable to execute command', toAppError(error));
    }
  }
}
