/**
 * Undo Service - Manages undo operations with time-based expiration
 *
 * Tracks operations that can be undone (delete, rename, move) and automatically
 * cleans them up after a specified timeout period.
 */

export interface UndoEntry {
  id: string;
  type: 'delete' | 'rename' | 'move';
  description: string;
  undoCallback: () => Promise<void>;
  createdAt: number;
}

export interface UndoOptions {
  timeout?: number; // milliseconds until undo expires
}

const DEFAULT_TIMEOUT = 10000; // 10 seconds

/**
 * Service for managing undo operations with automatic cleanup
 */
export class UndoService {
  private entries = new Map<string, UndoEntry>();
  private timeoutHandles = new Map<string, ReturnType<typeof setTimeout>>();
  private undoCallbacks = new Map<string, () => void>();

  /**
   * Register an operation that can be undone
   * @param id Unique identifier for this undo operation
   * @param type Type of operation (delete, rename, move)
   * @param description Human-readable description
   * @param undoCallback Async function to execute when undo is triggered
   * @param options Optional configuration (timeout)
   * @returns Cleanup function to cancel the undo
   */
  register(
    id: string,
    type: UndoEntry['type'],
    description: string,
    undoCallback: () => Promise<void>,
    options: UndoOptions = {},
  ): () => void {
    const timeout = options.timeout ?? DEFAULT_TIMEOUT;

    const entry: UndoEntry = {
      id,
      type,
      description,
      undoCallback,
      createdAt: Date.now(),
    };

    this.entries.set(id, entry);

    // Set up automatic cleanup after timeout
    const handle = setTimeout(() => {
      this.cleanup(id);
    }, timeout);

    this.timeoutHandles.set(id, handle);

    // Store cleanup callback for external cancellation
    const cleanupFn = () => this.cleanup(id);
    this.undoCallbacks.set(id, cleanupFn);

    return cleanupFn;
  }

  /**
   * Execute an undo operation
   * @param id The undo operation identifier
   * @returns Promise that resolves when undo completes
   */
  async execute(id: string): Promise<void> {
    const entry = this.entries.get(id);
    if (!entry) {
      throw new Error(`Undo operation ${id} not found or has expired`);
    }

    try {
      await entry.undoCallback();
    } finally {
      // Clean up regardless of success/failure
      this.cleanup(id);
    }
  }

  /**
   * Get an undo entry by ID
   * @param id The undo operation identifier
   * @returns The undo entry or undefined if not found
   */
  get(id: string): UndoEntry | undefined {
    return this.entries.get(id);
  }

  /**
   * Check if an undo operation exists and is still valid
   * @param id The undo operation identifier
   * @returns true if the operation can be undone
   */
  has(id: string): boolean {
    return this.entries.has(id);
  }

  /**
   * Get all active undo entries
   * @returns Array of all undo entries
   */
  getAll(): UndoEntry[] {
    return Array.from(this.entries.values());
  }

  /**
   * Clean up an undo operation (cancel timeout and remove entry)
   * @param id The undo operation identifier
   */
  private cleanup(id: string): void {
    // Clear timeout if it exists
    const handle = this.timeoutHandles.get(id);
    if (handle) {
      clearTimeout(handle);
      this.timeoutHandles.delete(id);
    }

    // Remove entry and callback
    this.entries.delete(id);
    this.undoCallbacks.delete(id);
  }

  /**
   * Cancel an undo operation without executing it
   * @param id The undo operation identifier
   */
  cancel(id: string): void {
    this.cleanup(id);
  }

  /**
   * For testing: clear all entries
   */
  clear(): void {
    this.timeoutHandles.forEach((handle) => clearTimeout(handle));
    this.entries.clear();
    this.timeoutHandles.clear();
    this.undoCallbacks.clear();
  }

  /**
   * Get the number of active undo operations
   */
  get size(): number {
    return this.entries.size;
  }
}

// Singleton instance
export const undoService = new UndoService();
