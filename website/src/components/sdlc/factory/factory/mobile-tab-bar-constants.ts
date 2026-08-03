import { PIPELINE_LANES } from '../../lib/tickets/pipeline-order';
import { PHASE_ORDER } from '../../lib/factory-floor-types';

const linearLanes = PIPELINE_LANES.filter(l => !l.side && l.key !== 'planning');

export const TABS = linearLanes.flatMap(l => {
  if (l.key === 'hall') {
    return PHASE_ORDER.map(p => ({
      key: p,
      label: p === 'implement' ? 'IMPL' : p.toUpperCase(),
    }));
  }
  const labelMap: Record<string, string> = {
    staged: 'STAGED',
    loadingDock: 'BACKLOG',
    qa: 'QS',
    awaitingDeploy: 'AWAITING',
    shipped: 'DONE'
  };
  const keyMap: Record<string, string> = {
    loadingDock: 'backlog',
    qa: 'qs',
    shipped: 'done'
  };
  return [{
    key: keyMap[l.key] || l.key,
    label: labelMap[l.key] || l.key.toUpperCase(),
  }];
});

export const MOBILE_COL_INDEX: Record<string, number> = Object.fromEntries(
  TABS.map((tab, idx) => [tab.key, idx])
);
