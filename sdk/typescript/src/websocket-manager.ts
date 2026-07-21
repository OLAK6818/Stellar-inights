type SubscriptionHandler = (data: unknown) => void;

interface ManagedSocket {
  ws: WebSocket;
  refCount: number;
  handlers: Set<SubscriptionHandler>;
}

function socketKey(rpcUrl: string, network: string): string {
  return `${network}::${rpcUrl}`;
}

const sockets = new Map<string, ManagedSocket>();

export class WebSocketManager {
  private readonly key: string;

  constructor(rpcUrl: string, network: string) {
    this.key = socketKey(rpcUrl, network);
  }

  subscribe(handler: SubscriptionHandler): () => void {
    let entry = sockets.get(this.key);

    if (!entry) {
      const ws = new WebSocket(this.key.split("::")[1]);
      entry = { ws, refCount: 0, handlers: new Set() };

      ws.addEventListener("message", (event) => {
        let data: unknown;
        try {
          data = JSON.parse(event.data as string);
        } catch {
          data = event.data;
        }
        entry!.handlers.forEach((h) => h(data));
      });

      ws.addEventListener("close", () => {
        sockets.delete(this.key);
      });

      sockets.set(this.key, entry);
    }

    entry.refCount++;
    entry.handlers.add(handler);

    return () => {
      const e = sockets.get(this.key);
      if (!e) return;
      e.handlers.delete(handler);
      e.refCount--;
      if (e.refCount <= 0) {
        e.ws.close();
        sockets.delete(this.key);
      }
    };
  }

  disconnect(): void {
    const entry = sockets.get(this.key);
    if (!entry) return;
    entry.handlers.clear();
    entry.refCount = 0;
    entry.ws.close();
    sockets.delete(this.key);
  }

  static disconnectAll(): void {
    sockets.forEach((entry, key) => {
      entry.handlers.clear();
      entry.ws.close();
      sockets.delete(key);
    });
  }
}
