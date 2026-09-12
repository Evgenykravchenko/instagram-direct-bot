export type MatchMode = 'exact' | 'contains' | 'any_word' | 'all_words';
export type MediaKind = 'photo' | 'video' | 'audio';

export interface KeywordRule {
  id: number;
  phrase: string;
  matchMode: MatchMode;
  priority: number;
  responseId: number;
}

export interface ContentBlock {
  kind: 'text' | 'photo' | 'video' | 'audio' | 'document';
  body: string | null;
  sendSeparately: boolean;
  media: {
    id: number;
    name: string;
    status: string;
    reference: string | null;
  } | null;
}

export interface ContentButton {
  label: string;
  action: 'text' | 'open_link';
  target: string;
  row: number;
  sort: number;
}

export interface ManagedResponse {
  id: number;
  fallbackText: string | null;
  blocks: ContentBlock[];
  buttons: ContentButton[];
}

export type OutboundMessage =
  | { type: 'text'; text: string }
  | { type: 'media'; kind: MediaKind; attachmentId: string; caption?: string }
  | {
      type: 'buttons';
      text: string;
      buttons: Array<
        | { type: 'postback'; title: string; payload: string }
        | { type: 'web_url'; title: string; url: string }
      >;
    };

export interface IncomingEvent {
  eventId: string;
  senderId: string;
  inputText: string;
  receivedAt: Date;
}

export interface QueuedEvent extends IncomingEvent {
  attempts: number;
  snapshot: OutboundMessage[] | null;
  deliveryCursor: number;
}

export interface MediaAsset {
  id: number;
  name: string;
  kind: 'photo' | 'video' | 'audio' | 'document';
  yandexPath: string;
}
