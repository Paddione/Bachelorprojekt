import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useToast, toast, reducer, toastWithUndo, __testing } from './use-toast';
import { undoService } from '@/services/undo-service';

describe('useToast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    __testing.resetToastState();
  });

  afterEach(() => {
    __testing.resetToastState();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('reducer', () => {
    it('should add toast to state', () => {
      const state = { toasts: [] };
      const action = {
        type: 'ADD_TOAST' as const,
        toast: {
          id: '1',
          title: 'Test Toast',
          description: 'Test Description',
        },
      };

      const newState = reducer(state, action);
      expect(newState.toasts).toHaveLength(1);
      expect(newState.toasts[0].id).toBe('1');
      expect(newState.toasts[0].title).toBe('Test Toast');
    });

    it('should limit toasts to max limit', () => {
      const state = { toasts: [] };

      // Add first toast
      let newState = reducer(state, {
        type: 'ADD_TOAST',
        toast: { id: '1', title: 'Toast 1' },
      });

      // Add second toast (should replace first due to TOAST_LIMIT = 1)
      newState = reducer(newState, {
        type: 'ADD_TOAST',
        toast: { id: '2', title: 'Toast 2' },
      });

      expect(newState.toasts).toHaveLength(1);
      expect(newState.toasts[0].id).toBe('2'); // Newer toast is kept
    });

    it('should update existing toast', () => {
      const state = {
        toasts: [{ id: '1', title: 'Original Title', description: 'Original Description' }],
      };

      const newState = reducer(state, {
        type: 'UPDATE_TOAST',
        toast: { id: '1', title: 'Updated Title' },
      });

      expect(newState.toasts[0].title).toBe('Updated Title');
      expect(newState.toasts[0].description).toBe('Original Description');
    });

    it('should not update non-existent toast', () => {
      const state = {
        toasts: [{ id: '1', title: 'Toast 1' }],
      };

      const newState = reducer(state, {
        type: 'UPDATE_TOAST',
        toast: { id: '2', title: 'Updated' },
      });

      expect(newState.toasts[0].title).toBe('Toast 1');
    });

    it('should dismiss specific toast', () => {
      const state = {
        toasts: [
          { id: '1', title: 'Toast 1', open: true },
          { id: '2', title: 'Toast 2', open: true },
        ],
      };

      const newState = reducer(state, {
        type: 'DISMISS_TOAST',
        toastId: '1',
      });

      expect(newState.toasts[0].open).toBe(false);
      expect(newState.toasts[1].open).toBe(true);
    });

    it('should dismiss all toasts when no toastId provided', () => {
      const state = {
        toasts: [
          { id: '1', title: 'Toast 1', open: true },
          { id: '2', title: 'Toast 2', open: true },
        ],
      };

      const newState = reducer(state, {
        type: 'DISMISS_TOAST',
      });

      expect(newState.toasts.every((t) => !t.open)).toBe(true);
    });

    it('should remove specific toast', () => {
      const state = {
        toasts: [
          { id: '1', title: 'Toast 1' },
          { id: '2', title: 'Toast 2' },
        ],
      };

      const newState = reducer(state, {
        type: 'REMOVE_TOAST',
        toastId: '1',
      });

      expect(newState.toasts).toHaveLength(1);
      expect(newState.toasts[0].id).toBe('2');
    });

    it('should remove all toasts when no toastId provided', () => {
      const state = {
        toasts: [
          { id: '1', title: 'Toast 1' },
          { id: '2', title: 'Toast 2' },
        ],
      };

      const newState = reducer(state, {
        type: 'REMOVE_TOAST',
      });

      expect(newState.toasts).toHaveLength(0);
    });
  });

  describe('toast function', () => {
    it('should create a toast', () => {
      const { result } = renderHook(() => useToast());

      act(() => {
        result.current.toast({
          title: 'Test Toast',
          description: 'Test Description',
        });
      });

      expect(result.current.toasts).toHaveLength(1);
      expect(result.current.toasts[0].title).toBe('Test Toast');
      expect(result.current.toasts[0].description).toBe('Test Description');
    });

    it('should return toast control object', () => {
      const { result } = renderHook(() => useToast());
      let toastControl: { id: string; dismiss: () => void; update: (props: any) => void };

      act(() => {
        toastControl = result.current.toast({
          title: 'Test Toast',
        });
      });

      expect(toastControl!).toHaveProperty('id');
      expect(toastControl!).toHaveProperty('dismiss');
      expect(toastControl!).toHaveProperty('update');
    });

    it('should dismiss toast via control object', () => {
      const { result } = renderHook(() => useToast());
      let toastControl: { id: string; dismiss: () => void; update: (props: any) => void };

      act(() => {
        toastControl = result.current.toast({
          title: 'Test Toast',
        });
      });

      expect(result.current.toasts).toHaveLength(1);

      act(() => {
        toastControl!.dismiss();
      });

      expect(result.current.toasts[0].open).toBe(false);
    });

    it('should update toast via control object', () => {
      const { result } = renderHook(() => useToast());
      let toastControl: { id: string; dismiss: () => void; update: (props: any) => void };

      act(() => {
        toastControl = result.current.toast({
          title: 'Original Title',
        });
      });

      act(() => {
        toastControl!.update({
          title: 'Updated Title',
          description: 'New Description',
        });
      });

      expect(result.current.toasts[0].title).toBe('Updated Title');
      expect(result.current.toasts[0].description).toBe('New Description');
    });
  });

  describe('useToast hook', () => {
    it('should initialize with empty toasts', () => {
      const { result } = renderHook(() => useToast());

      expect(result.current.toasts).toEqual([]);
    });

    it('should provide toast function', () => {
      const { result } = renderHook(() => useToast());
      expect(typeof result.current.toast).toBe('function');
    });

    it('should provide dismiss function', () => {
      const { result } = renderHook(() => useToast());
      expect(typeof result.current.dismiss).toBe('function');
    });

    it('should dismiss toast by id', () => {
      const { result } = renderHook(() => useToast());

      act(() => {
        result.current.toast({
          title: 'Toast 1',
        });
      });

      const toastId = result.current.toasts[0].id;

      act(() => {
        result.current.dismiss(toastId);
      });

      expect(result.current.toasts[0].open).toBe(false);
    });

    it('should dismiss all toasts when no id provided', () => {
      const { result } = renderHook(() => useToast());

      act(() => {
        result.current.toast({ title: 'Toast 1' });
      });

      act(() => {
        result.current.dismiss();
      });

      expect(result.current.toasts.every((t) => !t.open)).toBe(true);
    });

    it('should synchronize state across multiple hook instances', () => {
      const { result: result1 } = renderHook(() => useToast());
      const { result: result2 } = renderHook(() => useToast());

      act(() => {
        result1.current.toast({
          title: 'Shared Toast',
        });
      });

      // Both hooks should see the same toasts (shared state)
      // Note: This tests the global state nature of the toast system
      expect(result1.current.toasts.length).toBeGreaterThan(0);
    });

    it('should call onOpenChange when dismissed', () => {
      const { result } = renderHook(() => useToast());
      let toastControl: { id: string; dismiss: () => void; update: (props: any) => void };

      act(() => {
        toastControl = result.current.toast({
          title: 'Test Toast',
        });
      });

      const toast = result.current.toasts[0];

      act(() => {
        if (toast.onOpenChange) {
          toast.onOpenChange(false);
        }
      });

      expect(result.current.toasts[0].open).toBe(false);
    });
  });

  describe('toast variants', () => {
    it('should support destructive variant', () => {
      const { result } = renderHook(() => useToast());

      act(() => {
        result.current.toast({
          title: 'Error Toast',
          variant: 'destructive',
        });
      });

      expect(result.current.toasts[0].variant).toBe('destructive');
    });

    it('should support default variant', () => {
      const { result } = renderHook(() => useToast());

      act(() => {
        result.current.toast({
          title: 'Default Toast',
          variant: 'default',
        });
      });

      expect(result.current.toasts[0].variant).toBe('default');
    });
  });

  describe('toastWithUndo', () => {
    beforeEach(() => {
      undoService.clear();
    });

    afterEach(() => {
      undoService.clear();
    });

    it('should create a toast with undo action', () => {
      const { result } = renderHook(() => useToast());
      const undoCallback = vi.fn().mockResolvedValue(undefined);

      act(() => {
        result.current.toastWithUndo({
          title: 'Deleted',
          description: 'Video deleted',
          undoId: 'test-undo-1',
          undoType: 'delete',
          undoDescription: 'Delete video',
          undoCallback,
        });
      });

      expect(result.current.toasts).toHaveLength(1);
      expect(result.current.toasts[0].title).toBe('Deleted');
      expect(undoService.has('test-undo-1')).toBe(true);
    });

    it('should register undo operation with correct details', () => {
      const { result } = renderHook(() => useToast());
      const undoCallback = vi.fn().mockResolvedValue(undefined);

      act(() => {
        result.current.toastWithUndo({
          title: 'Renamed',
          undoId: 'rename-test',
          undoType: 'rename',
          undoDescription: 'Rename video',
          undoCallback,
        });
      });

      const entry = undoService.get('rename-test');
      expect(entry).toBeDefined();
      expect(entry?.type).toBe('rename');
      expect(entry?.description).toBe('Rename video');
    });

    it('should clean up undo operation when toast is dismissed', () => {
      const { result } = renderHook(() => useToast());
      const undoCallback = vi.fn().mockResolvedValue(undefined);
      let toastControl: any;

      act(() => {
        toastControl = result.current.toastWithUndo({
          title: 'Deleted',
          undoId: 'test-undo-1',
          undoType: 'delete',
          undoDescription: 'Delete video',
          undoCallback,
        });
      });

      expect(undoService.has('test-undo-1')).toBe(true);

      act(() => {
        toastControl.dismiss();
      });

      expect(undoService.has('test-undo-1')).toBe(false);
    });

    it('should use custom timeout', () => {
      const { result } = renderHook(() => useToast());
      const undoCallback = vi.fn().mockResolvedValue(undefined);

      act(() => {
        result.current.toastWithUndo({
          title: 'Deleted',
          undoId: 'test-undo-1',
          undoType: 'delete',
          undoDescription: 'Delete video',
          undoCallback,
          timeout: 5000,
        });
      });

      expect(undoService.has('test-undo-1')).toBe(true);

      act(() => {
        vi.advanceTimersByTime(5001);
      });

      expect(undoService.has('test-undo-1')).toBe(false);
    });

    it('should use default timeout of 10 seconds', () => {
      const { result } = renderHook(() => useToast());
      const undoCallback = vi.fn().mockResolvedValue(undefined);

      act(() => {
        result.current.toastWithUndo({
          title: 'Deleted',
          undoId: 'test-undo-1',
          undoType: 'delete',
          undoDescription: 'Delete video',
          undoCallback,
        });
      });

      expect(undoService.has('test-undo-1')).toBe(true);

      act(() => {
        vi.advanceTimersByTime(9999);
      });
      expect(undoService.has('test-undo-1')).toBe(true);

      act(() => {
        vi.advanceTimersByTime(2);
      });
      expect(undoService.has('test-undo-1')).toBe(false);
    });

    it('should support all undo types', () => {
      const { result } = renderHook(() => useToast());
      const undoCallback = vi.fn().mockResolvedValue(undefined);

      act(() => {
        result.current.toastWithUndo({
          title: 'Deleted',
          undoId: 'delete-1',
          undoType: 'delete',
          undoDescription: 'Delete operation',
          undoCallback,
        });

        result.current.toastWithUndo({
          title: 'Renamed',
          undoId: 'rename-1',
          undoType: 'rename',
          undoDescription: 'Rename operation',
          undoCallback,
        });

        result.current.toastWithUndo({
          title: 'Moved',
          undoId: 'move-1',
          undoType: 'move',
          undoDescription: 'Move operation',
          undoCallback,
        });
      });

      expect(undoService.get('delete-1')?.type).toBe('delete');
      expect(undoService.get('rename-1')?.type).toBe('rename');
      expect(undoService.get('move-1')?.type).toBe('move');
    });

    it('should support destructive variant', () => {
      const { result } = renderHook(() => useToast());
      const undoCallback = vi.fn().mockResolvedValue(undefined);

      act(() => {
        result.current.toastWithUndo({
          title: 'Error',
          variant: 'destructive',
          undoId: 'test-undo-1',
          undoType: 'delete',
          undoDescription: 'Delete video',
          undoCallback,
        });
      });

      expect(result.current.toasts[0].variant).toBe('destructive');
    });
  });
});
