import { Video } from '../types/video';

export interface BulkOperation {
  id: string;
  type: 'category' | 'rename' | 'move' | 'delete';
  videos: Video[];
  metadata: {
    categoryType?: string;
    categoryValue?: string;
    renamePattern?: string;
    destinationPath?: string;
  };
  createdAt: Date;
  status: 'pending' | 'in-progress' | 'completed' | 'failed';
  results?: {
    success: number;
    failed: number;
    errors: string[];
  };
}

export class BulkOperationsService {
  private static instance: BulkOperationsService;
  private operations: Map<string, BulkOperation> = new Map();

  static getInstance(): BulkOperationsService {
    if (!BulkOperationsService.instance) {
      BulkOperationsService.instance = new BulkOperationsService();
    }
    return BulkOperationsService.instance;
  }

  // Selection management
  private selectedVideos: Set<string> = new Set();
  private listeners: Set<(selected: Set<string>) => void> = new Set();

  getSelectedVideos(): Set<string> {
    return new Set(this.selectedVideos);
  }

  isVideoSelected(videoId: string): boolean {
    return this.selectedVideos.has(videoId);
  }

  toggleVideoSelection(videoId: string): void {
    if (this.selectedVideos.has(videoId)) {
      this.selectedVideos.delete(videoId);
    } else {
      this.selectedVideos.add(videoId);
    }
    this.notifyListeners();
  }

  selectVideo(videoId: string): void {
    this.selectedVideos.add(videoId);
    this.notifyListeners();
  }

  deselectVideo(videoId: string): void {
    this.selectedVideos.delete(videoId);
    this.notifyListeners();
  }

  selectAll(videoIds: string[]): void {
    this.selectedVideos.clear();
    videoIds.forEach((id) => this.selectedVideos.add(id));
    this.notifyListeners();
  }

  deselectAll(): void {
    this.selectedVideos.clear();
    this.notifyListeners();
  }

  getSelectedCount(): number {
    return this.selectedVideos.size;
  }

  hasSelection(): boolean {
    return this.selectedVideos.size > 0;
  }

  // Bulk category operations
  addCategoryToVideos(
    videos: Video[],
    categoryType: string,
    categoryValue: string,
  ): Promise<BulkOperation> {
    const operation: BulkOperation = {
      id: this.generateOperationId(),
      type: 'category',
      videos,
      metadata: {
        categoryType,
        categoryValue,
      },
      createdAt: new Date(),
      status: 'pending',
    };

    this.operations.set(operation.id, operation);
    return Promise.resolve(operation);
  }

  removeCategoryFromVideos(
    videos: Video[],
    categoryType: string,
    categoryValue: string,
  ): Promise<BulkOperation> {
    const operation: BulkOperation = {
      id: this.generateOperationId(),
      type: 'category',
      videos,
      metadata: {
        categoryType,
        categoryValue,
      },
      createdAt: new Date(),
      status: 'pending',
    };

    this.operations.set(operation.id, operation);
    return Promise.resolve(operation);
  }

  // Bulk rename operations
  renameVideos(videos: Video[], renamePattern: string): Promise<BulkOperation> {
    const operation: BulkOperation = {
      id: this.generateOperationId(),
      type: 'rename',
      videos,
      metadata: {
        renamePattern,
      },
      createdAt: new Date(),
      status: 'pending',
    };

    this.operations.set(operation.id, operation);
    return Promise.resolve(operation);
  }

  // Bulk move operations
  moveVideos(videos: Video[], destinationPath: string): Promise<BulkOperation> {
    const operation: BulkOperation = {
      id: this.generateOperationId(),
      type: 'move',
      videos,
      metadata: {
        destinationPath,
      },
      createdAt: new Date(),
      status: 'pending',
    };

    this.operations.set(operation.id, operation);
    return Promise.resolve(operation);
  }

  // Bulk delete operations
  deleteVideos(videos: Video[]): Promise<BulkOperation> {
    const operation: BulkOperation = {
      id: this.generateOperationId(),
      type: 'delete',
      videos,
      metadata: {},
      createdAt: new Date(),
      status: 'pending',
    };

    this.operations.set(operation.id, operation);
    return Promise.resolve(operation);
  }

  // Operation management
  getOperation(operationId: string): BulkOperation | undefined {
    return this.operations.get(operationId);
  }

  getAllOperations(): BulkOperation[] {
    return Array.from(this.operations.values()).sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );
  }

  updateOperationStatus(
    operationId: string,
    status: BulkOperation['status'],
    results?: BulkOperation['results'],
  ): void {
    const operation = this.operations.get(operationId);
    if (operation) {
      operation.status = status;
      if (results) {
        operation.results = results;
      }
    }
  }

  removeOperation(operationId: string): void {
    this.operations.delete(operationId);
  }

  // Event listeners
  addSelectionListener(listener: (selected: Set<string>) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    const selected = this.getSelectedVideos();
    this.listeners.forEach((listener) => listener(selected));
  }

  private generateOperationId(): string {
    return `bulk-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  // Utility methods
  getSelectedVideosFromList(videos: Video[]): Video[] {
    return videos.filter((video) => this.selectedVideos.has(video.id));
  }

  canPerformOperation(operationType: BulkOperation['type']): boolean {
    if (!this.hasSelection()) return false;

    switch (operationType) {
      case 'delete':
        return this.selectedVideos.size > 0;
      case 'move':
        return this.selectedVideos.size > 0;
      case 'rename':
        return this.selectedVideos.size > 0;
      case 'category':
        return this.selectedVideos.size > 0;
      default:
        return false;
    }
  }

  // Keyboard shortcuts for selection
  handleKeyboardSelection(e: KeyboardEvent, videoId: string, allVideoIds: string[]): boolean {
    switch (e.key) {
      case 'a':
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          this.selectAll(allVideoIds);
          return true;
        }
        break;
      case 'Escape':
        e.preventDefault();
        this.deselectAll();
        return true;
      case ' ':
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          this.toggleVideoSelection(videoId);
          return true;
        }
        break;
    }
    return false;
  }
}
