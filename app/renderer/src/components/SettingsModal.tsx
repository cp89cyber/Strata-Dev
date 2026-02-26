import { useEffect, useState } from 'react';

import type { AppSettings } from '@shared/contracts';

interface SettingsModalProps {
  visible: boolean;
  hasOpenAIKey: boolean;
  settings: AppSettings;
  onClose: () => void;
  onSaveKey: (key: string) => Promise<void>;
  onClearKey: () => Promise<void>;
  onUpdateSettings: (partial: Partial<AppSettings>) => Promise<void>;
}

export const SettingsModal = ({
  visible,
  hasOpenAIKey,
  settings,
  onClose,
  onSaveKey,
  onClearKey,
  onUpdateSettings
}: SettingsModalProps) => {
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState(settings.model);
  const [temperature, setTemperature] = useState(settings.temperature.toString());
  const [maxContextFiles, setMaxContextFiles] = useState(settings.maxContextFiles.toString());

  useEffect(() => {
    setModel(settings.model);
    setTemperature(settings.temperature.toString());
    setMaxContextFiles(settings.maxContextFiles.toString());
  }, [settings]);

  if (!visible) {
    return null;
  }

  return (
    <div className="modal-backdrop">
      <section className="settings-modal">
        <header>
          <h2>Settings</h2>
        </header>

        <div className="settings-group">
          <label>
            OpenAI API key
            <input
              type="password"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder={hasOpenAIKey ? 'A key is currently stored in keychain' : 'sk-...'}
            />
          </label>
          <div className="settings-row">
            <button className="btn" onClick={() => onSaveKey(apiKey)} disabled={apiKey.trim().length < 10}>
              Save Key
            </button>
            <button className="btn" onClick={onClearKey}>
              Clear Key
            </button>
          </div>
        </div>

        <div className="settings-group">
          <label>
            Model
            <input value={model} onChange={(event) => setModel(event.target.value)} />
          </label>
          <label>
            Temperature
            <input
              type="number"
              min={0}
              max={2}
              step={0.1}
              value={temperature}
              onChange={(event) => setTemperature(event.target.value)}
            />
          </label>
          <label>
            Max context files
            <input
              type="number"
              min={1}
              max={30}
              value={maxContextFiles}
              onChange={(event) => setMaxContextFiles(event.target.value)}
            />
          </label>
          <button
            className="btn btn-accent"
            onClick={() =>
              onUpdateSettings({
                model,
                temperature: Number(temperature),
                maxContextFiles: Number(maxContextFiles)
              })
            }
          >
            Save Preferences
          </button>
        </div>

        <footer>
          <button className="btn" onClick={onClose}>
            Close
          </button>
        </footer>
      </section>
    </div>
  );
};
