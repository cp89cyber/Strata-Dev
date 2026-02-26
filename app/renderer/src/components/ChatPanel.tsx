import { useMemo, useState } from 'react';

import type { ChatMessage } from '@shared/contracts';

interface ChatPanelProps {
  messages: ChatMessage[];
  streamingByTurn: Record<string, string>;
  isThinking: boolean;
  onSend: (prompt: string) => Promise<void>;
}

export const ChatPanel = ({ messages, streamingByTurn, isThinking, onSend }: ChatPanelProps) => {
  const [prompt, setPrompt] = useState('');

  const streamingEntries = useMemo(() => Object.entries(streamingByTurn), [streamingByTurn]);

  return (
    <section className="chat-panel">
      <header className="panel-header">
        <h3>Agent</h3>
      </header>

      <div className="chat-log">
        {messages.map((message) => (
          <article key={message.id} className={`chat-message ${message.role}`}>
            <h4>{message.role}</h4>
            <p>{message.content}</p>
          </article>
        ))}

        {streamingEntries.map(([turnId, content]) => (
          <article key={turnId} className="chat-message assistant streaming">
            <h4>assistant</h4>
            <p>{content || '...'}</p>
          </article>
        ))}
      </div>

      <form
        className="chat-input"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!prompt.trim()) {
            return;
          }
          const outgoing = prompt;
          setPrompt('');
          await onSend(outgoing);
        }}
      >
        <textarea
          rows={5}
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="Describe the coding task, request patches, or ask for test commands."
        />
        <button className="btn btn-accent" type="submit" disabled={isThinking}>
          {isThinking ? 'Thinking…' : 'Send'}
        </button>
      </form>
    </section>
  );
};
