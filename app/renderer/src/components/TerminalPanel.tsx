import { useEffect, useRef } from 'react';

import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';

import type { CommandOutputEvent, CommandProposal } from '@shared/contracts';

interface TerminalPanelProps {
  proposals: CommandProposal[];
  events: CommandOutputEvent[];
  onRunProposal: (proposalId: string) => Promise<void>;
}

export const TerminalPanel = ({ proposals, events, onRunProposal }: TerminalPanelProps) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const consumedEventsRef = useRef(0);

  useEffect(() => {
    if (!hostRef.current || terminalRef.current) {
      return;
    }

    const terminal = new Terminal({
      fontFamily: 'IBM Plex Mono, monospace',
      fontSize: 12,
      theme: {
        background: '#081018',
        foreground: '#e4f2ff'
      }
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(hostRef.current);
    fitAddon.fit();

    terminal.writeln('Strata terminal ready.');

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
    });

    resizeObserver.observe(hostRef.current);

    return () => {
      resizeObserver.disconnect();
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
      consumedEventsRef.current = 0;
    };
  }, []);

  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) {
      return;
    }

    const newEvents = events.slice(consumedEventsRef.current);
    consumedEventsRef.current = events.length;

    for (const event of newEvents) {
      if (event.stream === 'stdout' && event.chunk) {
        terminal.write(event.chunk.replace(/\n/g, '\r\n'));
      }

      if (event.stream === 'stderr' && event.chunk) {
        terminal.write(`\r\n[stderr] ${event.chunk.replace(/\n/g, '\r\n')}`);
      }

      if (event.stream === 'exit') {
        terminal.writeln(`\r\n[exit] code=${event.code ?? 1}`);
      }
    }
  }, [events]);

  return (
    <section className="terminal-panel">
      <header className="panel-header">
        <h3>Terminal</h3>
      </header>

      <div className="proposal-strip">
        {proposals
          .filter((proposal) => proposal.decision === 'pending')
          .map((proposal) => (
            <article key={proposal.id} className="proposal-card">
              <code>{proposal.command}</code>
              <small>cwd: {proposal.cwd}</small>
              <button className="btn" onClick={() => onRunProposal(proposal.id)}>
                Confirm & Run
              </button>
            </article>
          ))}
      </div>

      <div className="terminal-host" ref={hostRef} />
    </section>
  );
};
