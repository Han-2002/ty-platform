import type { WebSocket } from 'ws';

export interface RealtimeEvent {
  type: string;
  at: number;
  activityId?: string;
  seatId?: string;
  payload?: unknown;
}

interface ClientState {
  ws: WebSocket;
  activityId?: string;
  seatId?: string;
  isAlive: boolean;
}

export class RealtimeHub {
  private readonly clients = new Set<ClientState>();

  add(ws: WebSocket, filters: { activityId?: string; seatId?: string }): void {
    const state: ClientState = {
      ws,
      activityId: filters.activityId,
      seatId: filters.seatId,
      isAlive: true,
    };
    this.clients.add(state);

    ws.on('pong', () => {
      state.isAlive = true;
    });
    ws.on('close', () => {
      this.clients.delete(state);
    });
    ws.on('error', () => {
      this.clients.delete(state);
    });

    this.sendTo(state, {
      type: 'system.connected',
      at: Date.now(),
      activityId: filters.activityId,
      seatId: filters.seatId,
      payload: { message: 'WebSocket connected' },
    });
  }

  publish(event: RealtimeEvent): void {
    for (const client of this.clients) {
      if (client.ws.readyState !== client.ws.OPEN) continue;
      if (client.activityId && event.activityId && client.activityId !== event.activityId) continue;
      if (client.seatId && event.seatId && client.seatId !== event.seatId) continue;
      this.sendTo(client, event);
    }
  }

  heartbeat(): void {
    for (const client of this.clients) {
      if (!client.isAlive) {
        client.ws.terminate();
        this.clients.delete(client);
        continue;
      }
      client.isAlive = false;
      client.ws.ping();
    }
  }

  get clientCount(): number {
    return this.clients.size;
  }

  closeAll(): void {
    for (const client of this.clients) client.ws.close();
    this.clients.clear();
  }

  private sendTo(client: ClientState, event: RealtimeEvent): void {
    if (client.ws.readyState === client.ws.OPEN) {
      client.ws.send(JSON.stringify(event));
    }
  }
}
