import type { ManagedResponse, OutboundMessage } from './types.js';

const BUTTON_TITLE_LIMIT = 20;

export function renderResponse(response: ManagedResponse): OutboundMessage[] {
  const messages: OutboundMessage[] = [];
  const combinedText: string[] = [];

  for (const block of response.blocks) {
    if (block.kind === 'text') {
      if (!block.body?.trim()) continue;
      if (block.sendSeparately) messages.push({ type: 'text', text: block.body.trim() });
      else combinedText.push(block.body.trim());
      continue;
    }

    if (block.kind === 'document') {
      if (block.body?.trim()) combinedText.push(block.body.trim());
      continue;
    }

    const reference = block.media?.status === 'ready' ? block.media.reference : null;
    if (!reference) {
      const label = block.media?.name ?? 'Медиафайл';
      combinedText.push(`${label} ещё готовится. Попробуйте немного позже.`);
      continue;
    }

    const mediaMessage: OutboundMessage = {
      type: 'media',
      kind: block.kind,
      attachmentId: reference,
      ...(block.body?.trim() ? { caption: block.body.trim() } : {}),
    };
    messages.push(mediaMessage);
  }

  if (combinedText.length > 0) messages.unshift({ type: 'text', text: combinedText.join('\n\n') });
  if (messages.length === 0 && response.fallbackText?.trim()) {
    messages.push({ type: 'text', text: response.fallbackText.trim() });
  }

  const buttons = response.buttons
    .filter((button) => button.label.trim() && button.target.trim())
    .sort((left, right) => left.row - right.row || left.sort - right.sort)
    .map((button) =>
      button.action === 'open_link'
        ? ({
            type: 'web_url' as const,
            title: shorten(button.label),
            url: button.target,
          } satisfies Extract<OutboundMessage, { type: 'buttons' }>['buttons'][number])
        : ({
            type: 'postback' as const,
            title: shorten(button.label),
            payload: button.target,
          } satisfies Extract<OutboundMessage, { type: 'buttons' }>['buttons'][number]),
    );

  for (let index = 0; index < buttons.length; index += 3) {
    messages.push({
      type: 'buttons',
      text: index === 0 ? 'Выберите действие:' : 'Ещё варианты:',
      buttons: buttons.slice(index, index + 3),
    });
  }

  return messages;
}

function shorten(value: string): string {
  const label = value.trim();
  return label.length <= BUTTON_TITLE_LIMIT ? label : `${label.slice(0, BUTTON_TITLE_LIMIT - 1)}…`;
}
