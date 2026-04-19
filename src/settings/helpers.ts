import { Setting, type TextComponent } from 'obsidian';

export function addDivider(containerEl: HTMLElement): void {
  const divider = containerEl.createDiv({ cls: 'setting-item' });
  divider.style.borderTop = '1px solid var(--background-modifier-border)';
  divider.style.margin = '12px 0';
}

export function addTextSetting(
  containerEl: HTMLElement,
  name: string,
  description: string,
  value: string,
  onChange: (value: string) => Promise<void>,
  options: { placeholder?: string } = {},
): void {
  new Setting(containerEl).setName(name).setDesc(description).addText((text) => {
    text.setValue(value);
    if (options.placeholder) {
      text.setPlaceholder(options.placeholder);
    }
    text.onChange(onChange);
  });
}

export function addSecretSetting(
  containerEl: HTMLElement,
  name: string,
  description: string,
  value: string,
  onChange: (value: string) => Promise<void>,
): void {
  let textComponent: TextComponent | null = null;
  let isVisible = false;

  new Setting(containerEl)
    .setName(name)
    .setDesc(description)
    .addText((text) => {
      textComponent = text;
      text.setValue(value);
      text.inputEl.type = 'password';
      text.onChange(onChange);
    })
    .addExtraButton((button) => {
      button
        .setIcon('eye')
        .setTooltip('Show or hide secret')
        .onClick(() => {
          if (!textComponent) {
            return;
          }

          isVisible = !isVisible;
          textComponent.inputEl.type = isVisible ? 'text' : 'password';
          button.setIcon(isVisible ? 'eye-off' : 'eye');
        });
    });
}

export function formatTimestamp(value: string | null): string {
  if (!value) {
    return 'Not available';
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export function renderHint(containerEl: HTMLElement, lines: string[]): void {
  const hint = containerEl.createDiv({ cls: 'setting-item-description' });
  hint.empty();

  for (const line of lines) {
    hint.createDiv({ text: line });
  }
}
