import type { EventHandler, EventPattern, EventType, LiliumEvent } from "./contracts/events";

function matches(pattern: EventPattern, type: EventType): boolean {
  if (pattern === "*" || pattern === type) return true;
  if (pattern.endsWith(".*")) return type.startsWith(pattern.slice(0, -1));
  if (pattern.startsWith("*.")) return type.endsWith(pattern.slice(1));
  return false;
}

let counter = 0;
function newId() {
  counter += 1;
  return `evt_${Date.now().toString(36)}_${counter.toString(36)}`;
}

type EmitInput<E extends LiliumEvent = LiliumEvent> = E extends unknown
  ? Omit<E, "id" | "ts"> & Partial<Pick<E, "id" | "ts">>
  : never;

export interface EventBus {
  emit(event: EmitInput): void;
  on<T extends EventType>(pattern: T, handler: EventHandler<T>): () => void;
  on(pattern: EventPattern, handler: EventHandler): () => void;
  history(limit?: number): LiliumEvent[];
  clear(): void;
}

export function createEventBus(options: { historyLimit?: number } = {}): EventBus {
  const historyLimit = options.historyLimit ?? 500;
  const subs: Array<{ pattern: EventPattern; handler: EventHandler }> = [];
  const log: LiliumEvent[] = [];

  const bus: EventBus = {
    emit(raw) {
      const event = { id: raw.id ?? newId(), ts: raw.ts ?? Date.now(), ...raw } as LiliumEvent;
      log.push(event);
      if (log.length > historyLimit) log.splice(0, log.length - historyLimit);
      for (const s of subs) {
        if (matches(s.pattern, event.type)) {
          try {
            const r = s.handler(event as never);
            if (r && typeof (r as Promise<void>).catch === "function") {
              (r as Promise<void>).catch((err) => console.error("[event-bus] handler error", err));
            }
          } catch (err) {
            console.error("[event-bus] handler threw", err);
          }
        }
      }
    },
    on(pattern: EventPattern, handler: EventHandler) {
      const sub = { pattern, handler: handler as EventHandler };
      subs.push(sub);
      return () => {
        const i = subs.indexOf(sub);
        if (i >= 0) subs.splice(i, 1);
      };
    },
    history(limit) {
      return limit ? log.slice(-limit) : log.slice();
    },
    clear() {
      log.length = 0;
    },
  };

  return bus;
}