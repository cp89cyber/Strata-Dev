import keytar from 'keytar';

import type { AppSettings, Result } from '../../shared/contracts';

import { err, ok, toAppError } from './errors';
import { DatabaseService } from './databaseService';

const SERVICE_NAME = 'strata-dev';
const OPENAI_ACCOUNT = 'openai-api-key';

export class SettingsService {
  constructor(private readonly database: DatabaseService) {}

  async setOpenAIKey(key: string): Promise<Result<void>> {
    try {
      await keytar.setPassword(SERVICE_NAME, OPENAI_ACCOUNT, key);
      return ok(undefined);
    } catch (error) {
      return err('INTERNAL_ERROR', 'Failed to store OpenAI API key in system keychain', toAppError(error));
    }
  }

  async clearOpenAIKey(): Promise<Result<void>> {
    try {
      await keytar.deletePassword(SERVICE_NAME, OPENAI_ACCOUNT);
      return ok(undefined);
    } catch (error) {
      return err('INTERNAL_ERROR', 'Failed to clear OpenAI API key', toAppError(error));
    }
  }

  async hasOpenAIKey(): Promise<Result<boolean>> {
    try {
      const value = await keytar.getPassword(SERVICE_NAME, OPENAI_ACCOUNT);
      return ok(Boolean(value));
    } catch (error) {
      return err('INTERNAL_ERROR', 'Unable to read OpenAI API key state', toAppError(error));
    }
  }

  async getOpenAIKey(): Promise<Result<string>> {
    try {
      const value = await keytar.getPassword(SERVICE_NAME, OPENAI_ACCOUNT);
      if (!value) {
        return err('OPENAI_KEY_MISSING', 'OpenAI API key has not been configured');
      }
      return ok(value);
    } catch (error) {
      return err('INTERNAL_ERROR', 'Unable to read OpenAI API key', toAppError(error));
    }
  }

  getSettings(): AppSettings {
    return this.database.safeCall(() => this.database.getSettings());
  }

  updateSettings(partial: Partial<AppSettings>): Result<AppSettings> {
    try {
      const settings = this.database.safeCall(() => this.database.updateSettings(partial));
      return ok(settings);
    } catch (error) {
      return err('DATABASE_ERROR', 'Failed to update settings', toAppError(error));
    }
  }
}
