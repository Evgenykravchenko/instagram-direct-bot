import { describe, expect, it } from 'vitest';
import { renderResponse } from '../src/domain/render-response.js';
import type { ManagedResponse } from '../src/domain/types.js';

describe('renderResponse', () => {
  it('renders text, prepared media and chunks buttons by three', () => {
    const response: ManagedResponse = {
      id: 1,
      fallbackText: null,
      blocks: [
        { kind: 'text', body: 'Привет!', sendSeparately: false, media: null },
        {
          kind: 'photo',
          body: 'Подпись',
          sendSeparately: false,
          media: { id: 3, name: 'Фото', status: 'ready', reference: 'attachment-1' },
        },
      ],
      buttons: Array.from({ length: 4 }, (_, index) => ({
        label: `Кнопка ${index + 1}`,
        action: 'text' as const,
        target: `command-${index + 1}`,
        row: 1,
        sort: index,
      })),
    };

    const messages = renderResponse(response);
    expect(messages[0]).toEqual({ type: 'text', text: 'Привет!' });
    expect(messages[1]).toEqual({
      type: 'media',
      kind: 'photo',
      attachmentId: 'attachment-1',
      caption: 'Подпись',
    });
    expect(messages.filter((message) => message.type === 'buttons')).toHaveLength(2);
  });

  it('does not expose an unsupported document as an attachment', () => {
    const messages = renderResponse({
      id: 2,
      fallbackText: 'Резервный текст',
      blocks: [{ kind: 'document', body: null, sendSeparately: false, media: null }],
      buttons: [],
    });
    expect(messages).toEqual([{ type: 'text', text: 'Резервный текст' }]);
  });

  it('drops unsafe link buttons', () => {
    const messages = renderResponse({
      id: 3,
      fallbackText: 'Текст',
      blocks: [],
      buttons: [
        {
          label: 'Опасная ссылка',
          action: 'open_link',
          target: 'javascript:alert(1)',
          row: 1,
          sort: 1,
        },
      ],
    });
    expect(messages).toEqual([{ type: 'text', text: 'Текст' }]);
  });
});
