// mobile-signer/src/services/CoordinatorWS.ts

interface WebSocketMessage {
  type: string;
  [key: string]: any;
}

type EventHandler = (data: any) => void;

class CoordinatorWebSocketClient {
  private ws: WebSocket | null = null;
  private wsUrl: string = '';
  private token: string = '';
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private heartbeatInterval: any = null;
  private eventHandlers: Map<string, EventHandler[]> = new Map();

  connect(wsUrl: string, token: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.wsUrl = wsUrl;
      this.token = token;

      const url = `${wsUrl}?token=${token}`;
      console.log('📡 Connecting to WebSocket:', url);

      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        console.log('✅ WebSocket connected');
        this.reconnectAttempts = 0;
        this.startHeartbeat();
        resolve();
      };

      this.ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          console.log('📨 Received message:', message.type);
          this.handleMessage(message);
        } catch (error) {
          console.error('❌ Error parsing message:', error);
        }
      };

      this.ws.onerror = (error) => {
        console.error('❌ WebSocket error:', error);
        reject(error);
      };

      this.ws.onclose = () => {
        console.log('🔌 WebSocket disconnected');
        this.stopHeartbeat();
        this.emit('disconnected', {});
        this.attemptReconnect();
      };
    });
  }

  private handleMessage(message: WebSocketMessage) {
    switch (message.type) {
      case 'connected':
        this.emit('connected', message);
        break;

      case 'pong':
        // Heartbeat response
        break;

      case 'keygen_start':
        console.log('🚀 Keygen ceremony starting!');
        this.emit('keygen_start', message);
        break;

      case 'keygen_round':
        this.emit('keygen_round', message);
        break;

      case 'keygen_success':
        console.log('🎉 Keygen ceremony completed!');
        this.emit('keygen_success', message);
        break;

      case 'keygen_failed':
        console.error('❌ Keygen ceremony failed');
        this.emit('keygen_failed', message);
        break;

      case 'signing_start':
        this.emit('signing_start', message);
        break;

      case 'sign_round':
        this.emit('sign_round', message);
        break;

      case 'signing_success':
        this.emit('signing_success', message);
        break;

      case 'recovery_start':
        console.log('🔄 Recovery ceremony starting!');
        this.emit('recovery_start', message);
        break;

      case 'recovery_round':
        this.emit('recovery_round', message);
        break;

      case 'recovery_complete':
        this.emit('recovery_complete', message);
        break;

      case 'recovery_success':
        console.log('🎉 Recovery ceremony completed!');
        this.emit('recovery_success', message);
        break;

      case 'recovery_failed':
        console.error('❌ Recovery ceremony failed');
        this.emit('recovery_failed', message);
        break;

      case 'recovery_cancelled':
        console.log('🚫 Recovery ceremony cancelled');
        this.emit('recovery_cancelled', message);
        break;

      default:
        console.log('⚠️ Unknown message type:', message.type);
    }
  }

  send(message: WebSocketMessage) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
      console.log('📤 Sent message:', message.type);
    } else {
      console.error('❌ WebSocket not connected');
    }
  }

  disconnect() {
    this.stopHeartbeat();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  private startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      this.send({ type: 'ping' });
    }, 30000); // Every 30 seconds
  }

  private stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('❌ Max reconnection attempts reached');
      this.emit('reconnect_failed', {});
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);

    console.log(`🔄 Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

    setTimeout(() => {
      this.connect(this.wsUrl, this.token);
    }, delay);
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  // Simple event emitter implementation
  on(event: string, handler: EventHandler) {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event)!.push(handler);
  }

  off(event: string, handler: EventHandler) {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  removeAllListeners(event?: string) {
    if (event) {
      this.eventHandlers.delete(event);
    } else {
      this.eventHandlers.clear();
    }
  }

  private emit(event: string, data: any) {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.forEach(handler => handler(data));
    }
  }
}

export const coordinatorWS = new CoordinatorWebSocketClient();