import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DirectoryDatabase } from '@/services/directory-database';
import { ChevronRight, ChevronDown, Folder, Home } from 'lucide-react';

interface DirectoryPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (relativeDirPath: string) => void;
}

interface TreeNode {
  name: string;
  path: string; // normalized with trailing slash or empty for root
  children: TreeNode[];
}

function buildTree(directories: string[]): TreeNode {
  const root: TreeNode = { name: '', path: '', children: [] };
  const pathToNode = new Map<string, TreeNode>([['', root]]);

  const ensureNode = (parentPath: string, segment: string) => {
    const childPath = parentPath ? `${parentPath}${segment}/` : `${segment}/`;
    if (!pathToNode.has(childPath)) {
      const node: TreeNode = { name: segment, path: childPath, children: [] };
      const parent = pathToNode.get(parentPath)!;
      parent.children.push(node);
      pathToNode.set(childPath, node);
    }
    return pathToNode.get(childPath)!;
  };

  const normalized = Array.from(new Set(directories.map(DirectoryDatabase.normalizeDir)));
  normalized.forEach((dir) => {
    const segments = dir.split('/').filter(Boolean);
    let parentPath = '';
    for (const seg of segments) {
      const node = ensureNode(parentPath, seg);
      parentPath = node.path;
    }
  });

  // Sort children alphabetically at each level for stable UI
  const sortTree = (node: TreeNode) => {
    node.children.sort((a, b) => a.name.localeCompare(b.name));
    node.children.forEach(sortTree);
  };
  sortTree(root);

  return root;
}

export function DirectoryPickerModal({ isOpen, onClose, onSelect }: DirectoryPickerModalProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['']));
  const [selectedPath, setSelectedPath] = useState<string>('');
  const [filter, setFilter] = useState('');
  const [lastRootKey, setLastRootKey] = useState<string | null>(null);
  const [rootName, setRootName] = useState<string>('');
  const [directories, setDirectories] = useState<string[]>([]);

  useEffect(() => {
    if (isOpen) {
      const key = DirectoryDatabase.getLastRootKey();
      setLastRootKey(key);
      const roots = DirectoryDatabase.listRoots();
      const rootMeta = roots.find(r => r.rootKey === key);
      setRootName(rootMeta?.name || (key || ''));
      setDirectories(key ? DirectoryDatabase.getDirectories(key) : []);
      setSelectedPath('');
      setExpanded(new Set(['']));
      setFilter('');
    }
  }, [isOpen]);

  const tree = useMemo(() => buildTree(directories), [directories]);

  const filteredPaths = useMemo(() => {
    const f = filter.trim().toLowerCase();
    if (!f) return null;
    // Collect all paths that include the filter substring
    const hits = new Set<string>();
    const visit = (node: TreeNode) => {
      if (node.path.toLowerCase().includes(f) || node.name.toLowerCase().includes(f)) {
        hits.add(node.path);
        // also include ancestors by adding prefixes
        const parts = node.path.split('/').filter(Boolean);
        let acc = '';
        for (const p of parts) {
          acc = acc ? `${acc}${p}/` : `${p}/`;
          hits.add(acc);
        }
        hits.add('');
      }
      node.children.forEach(visit);
    };
    visit(tree);
    return hits;
  }, [filter, tree]);

  const toggle = (path: string) => {
    const next = new Set(expanded);
    if (next.has(path)) next.delete(path); else next.add(path);
    setExpanded(next);
  };

  const renderNode = (node: TreeNode, depth: number) => {
    const isRoot = node.path === '';
    const hasChildren = node.children.length > 0;
    const isExpanded = expanded.has(node.path);
    const showNode = !filteredPaths || filteredPaths.has(node.path);
    if (!showNode) return null;

    return (
      <div key={node.path} className="select-none">
        <div
          className="flex items-center gap-2 py-1 px-2 rounded hover:bg-accent cursor-pointer"
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
          onClick={() => setSelectedPath(node.path)}
        >
          {hasChildren ? (
            <button
              type="button"
              className="p-0.5 rounded hover:bg-muted"
              onClick={(e) => { e.stopPropagation(); toggle(node.path); }}
              aria-label={isExpanded ? t('directoryPicker.collapse') : t('directoryPicker.expand')}
            >
              {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
          ) : (
            <span className="w-4 inline-block" />
          )}
          {isRoot ? <Home className="h-4 w-4 text-primary" /> : <Folder className="h-4 w-4 text-muted-foreground" />}
          <span className={selectedPath === node.path ? 'font-medium text-primary' : ''}>
            {isRoot ? (rootName || 'Root') : node.name}
          </span>
        </div>
        {hasChildren && isExpanded && (
          <div>
            {node.children.map(child => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  const handleSelect = () => {
    onSelect(DirectoryDatabase.normalizeDir(selectedPath));
    onClose();
  };

  const disabled = !lastRootKey;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{t('directoryPicker.title')}</DialogTitle>
          <DialogDescription className="sr-only">{t('directoryPicker.description')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="text-sm text-muted-foreground">
            {lastRootKey ? t('directoryPicker.root', { name: rootName }) : t('directoryPicker.noRoot')}
          </div>
          <Input
            placeholder={t('directoryPicker.filterPlaceholder')}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <div className="border rounded max-h-80 overflow-auto">
            {directories.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground">{t('directoryPicker.noDirectories')}</div>
            ) : (
              <div className="py-1">
                {renderNode(tree, 0)}
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
          <Button onClick={handleSelect} disabled={disabled}>{t('common.select')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
