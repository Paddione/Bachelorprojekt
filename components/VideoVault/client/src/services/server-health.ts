import { ApiClient } from './api-client';

class ServerHealth {
  private healthy: boolean | null = null;
  private checking: Promise<boolean> | null = null;

  async isHealthy(): Promise<boolean> {
    if (this.healthy !== null) return this.healthy;
    if (this.checking) return this.checking;
    this.checking = (async () => {
      try {
        // Use general server health, not DB health (settings and other APIs work without DB)
        const res = await ApiClient.get<{ status: string }>(`/api/health`);
        this.healthy = res?.status === 'healthy';
      } catch {
        this.healthy = false;
      } finally {
        this.checking = null;
      }
      return this.healthy;
    })();
    return this.checking;
  }

  markUnhealthy() {
    this.healthy = false;
  }
}

export const serverHealth = new ServerHealth();
