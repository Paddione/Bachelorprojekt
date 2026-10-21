import { describe, it, expect } from 'vitest';
import { GpuEventBuffer } from './gpu';

describe('GpuEventBuffer', () => {
  it('pushes events and maintains ring buffer limit', () => {
    const buffer = new GpuEventBuffer(3);
    const e1 = buffer.push('test', { step: 1 });
    const e2 = buffer.push('test', { step: 2 });
    const e3 = buffer.push('test', { step: 3 });
    const e4 = buffer.push('test', { step: 4 });

    expect(e1.id).toBe(1);
    expect(e4.id).toBe(4);

    const events = buffer.getSince(0);
    expect(events.length).toBe(3);
    expect(events.map((e) => e.data.step)).toEqual([2, 3, 4]);
  });

  it('filters events by lastId for SSE reconnection', () => {
    const buffer = new GpuEventBuffer(10);
    buffer.push('metric', { loss: 0.5 });
    buffer.push('metric', { loss: 0.4 });
    buffer.push('metric', { loss: 0.3 });

    const since2 = buffer.getSince(2);
    expect(since2.length).toBe(1);
    expect(since2[0].data.loss).toBe(0.3);
  });
});
