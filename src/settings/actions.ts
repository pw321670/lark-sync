import { Notice } from 'obsidian';

import type LarkSyncPlugin from '../main';
import { validateConfig } from '../utils/contracts';

function setButtonState(button: HTMLButtonElement | undefined, disabled: boolean, label: string): string {
  if (!button) {
    return '';
  }

  const originalLabel = button.textContent ?? '';
  button.disabled = disabled;
  button.textContent = label;
  return originalLabel;
}

function restoreButtonState(button: HTMLButtonElement | undefined, originalLabel: string): void {
  if (!button) {
    return;
  }

  button.disabled = false;
  button.textContent = originalLabel;
}

export async function testConnection(
  plugin: LarkSyncPlugin,
  button?: HTMLButtonElement,
  refresh?: () => void,
): Promise<void> {
  const originalLabel = setButtonState(button, true, 'Authorizing...');

  try {
    const { config, auth } = plugin.getPluginData();
    const validation = validateConfig(config);

    if (!validation.isValid) {
      new Notice(`Configuration is incomplete: ${validation.errors.join(', ')}`, 6000);
      return;
    }

    if (!auth.refreshToken) {
      new Notice('Opening Feishu authorization...', 4000);
      const authResult = await plugin.authorizeFeishu();

      if (!authResult.success) {
        new Notice(`Authorization failed: ${authResult.error}`, 8000);
        return;
      }
    }

    await plugin.verifyFeishuConnection();
    new Notice('Authorization successful.', 4000);
    refresh?.();
  } catch (error) {
    new Notice(
      `Authorization failed: ${error instanceof Error ? error.message : String(error)}`,
      8000,
    );
  } finally {
    restoreButtonState(button, originalLabel);
  }
}
