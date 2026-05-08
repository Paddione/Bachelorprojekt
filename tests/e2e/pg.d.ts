declare module 'pg' {
  export class Pool {
    constructor(config: { connectionString: string });
    query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
    end(): Promise<void>;
  }
}
