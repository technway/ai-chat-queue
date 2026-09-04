export type MessageSendResult = "sent" | "deferred" | "staged";

export interface MessageSender {
  send(content: string): MessageSendResult | Promise<MessageSendResult>;
}
