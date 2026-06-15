import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useState } from 'react';
import { Loader2, ArrowLeft, Edit2, Merge, Trash2, Plus } from 'lucide-react';
import { Link } from 'wouter';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TagImporter } from '@/components/tags/tag-importer';

interface Tag {
  id: string;
  name: string;
  type: string;
  count: number;
}

interface Synonym {
  source: string;
  target: string;
}

export default function TagsPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [renameTag, setRenameTag] = useState<Tag | null>(null);
  const [newName, setNewName] = useState('');
  const [mergeSource, setMergeSource] = useState<Tag | null>(null);
  const [mergeTargetId, setMergeTargetId] = useState('');
  const [newSynonymSource, setNewSynonymSource] = useState('');
  const [newSynonymTarget, setNewSynonymTarget] = useState('');

  const { data: tags, isLoading: tagsLoading } = useQuery<Tag[]>({
    queryKey: ['tags'],
    queryFn: async () => {
      const res = await fetch('/api/tags');
      return res.json() as Promise<Tag[]>;
    },
  });

  const { data: synonyms, isLoading: synonymsLoading } = useQuery<Synonym[]>({
    queryKey: ['synonyms'],
    queryFn: async () => {
      const res = await fetch('/api/tags/synonyms');
      return res.json() as Promise<Synonym[]>;
    },
  });

  const renameMutation = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const res = await fetch(`/api/tags/${id}/rename`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newName: name }),
      });
      if (!res.ok) throw new Error('Failed to rename tag');
      return res.json() as Promise<{ updatedVideos: number }>;
    },
    onSuccess: (data) => {
      toast({
        title: t('tags.tagRenamed'),
        description: t('tags.updatedVideos', { count: data.updatedVideos }),
      });
      void queryClient.invalidateQueries({ queryKey: ['tags'] });
      setRenameTag(null);
      setNewName('');
    },
  });

  const mergeMutation = useMutation({
    mutationFn: async ({ sourceId, targetId }: { sourceId: string; targetId: string }) => {
      const res = await fetch('/api/tags/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceId, targetId }),
      });
      if (!res.ok) throw new Error('Failed to merge tags');
      return res.json() as Promise<{ updatedVideos: number }>;
    },
    onSuccess: (data) => {
      toast({
        title: t('tags.tagsMerged'),
        description: t('tags.updatedVideos', { count: data.updatedVideos }),
      });
      void queryClient.invalidateQueries({ queryKey: ['tags'] });
      setMergeSource(null);
      setMergeTargetId('');
    },
  });

  const addSynonymMutation = useMutation({
    mutationFn: async ({ source, target }: { source: string; target: string }) => {
      const res = await fetch('/api/tags/synonyms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source, target }),
      });
      if (!res.ok) throw new Error('Failed to add synonym');
      return res.json() as Promise<unknown>;
    },
    onSuccess: () => {
      toast({ title: t('tags.synonymAdded') });
      void queryClient.invalidateQueries({ queryKey: ['synonyms'] });
      setNewSynonymSource('');
      setNewSynonymTarget('');
    },
  });

  const deleteSynonymMutation = useMutation({
    mutationFn: async (source: string) => {
      const res = await fetch(`/api/tags/synonyms/${source}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete synonym');
      return res.json() as Promise<unknown>;
    },
    onSuccess: () => {
      toast({ title: t('tags.synonymDeleted') });
      void queryClient.invalidateQueries({ queryKey: ['synonyms'] });
    },
  });

  const filteredTags =
    tags?.filter((t) => t.name.toLowerCase().includes(search.toLowerCase())) || [];

  if (tagsLoading || synonymsLoading)
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="animate-spin" />
      </div>
    );

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center space-x-4">
        <Link href="/">
          <Button variant="ghost">
            <ArrowLeft className="mr-2 h-4 w-4" /> {t('common.back')}
          </Button>
        </Link>
        <h1 className="text-2xl font-bold">{t('tags.title')}</h1>
      </div>

      <Tabs defaultValue="tags">
        <TabsList>
          <TabsTrigger value="tags">{t('tags.tabTags')}</TabsTrigger>
          <TabsTrigger value="synonyms">{t('tags.tabSynonyms')}</TabsTrigger>
          <TabsTrigger value="import">{t('tags.tabImport')}</TabsTrigger>
        </TabsList>

        <TabsContent value="tags" className="space-y-4">
          <div className="flex items-center space-x-2">
            <Input
              placeholder={t('tags.searchPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-sm"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredTags.map((tag) => (
              <Card key={tag.id}>
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <div className="font-medium">{tag.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {tag.type} • {tag.count} {t('tags.videos')}
                    </div>
                  </div>
                  <div className="flex space-x-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setRenameTag(tag);
                        setNewName(tag.name);
                      }}
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setMergeSource(tag);
                      }}
                    >
                      <Merge className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="synonyms" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t('tags.addSynonym')}</CardTitle>
            </CardHeader>
            <CardContent className="flex items-end space-x-2">
              <div className="grid w-full gap-1.5">
                <Label>{t('tags.sourceLabel')}</Label>
                <Input
                  value={newSynonymSource}
                  onChange={(e) => setNewSynonymSource(e.target.value)}
                />
              </div>
              <div className="grid w-full gap-1.5">
                <Label>{t('tags.targetLabel')}</Label>
                <Input
                  value={newSynonymTarget}
                  onChange={(e) => setNewSynonymTarget(e.target.value)}
                />
              </div>
              <Button
                onClick={() =>
                  addSynonymMutation.mutate({
                    source: newSynonymSource,
                    target: newSynonymTarget,
                  })
                }
                disabled={!newSynonymSource || !newSynonymTarget}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </CardContent>
          </Card>

          <div className="space-y-2">
            {synonyms?.map((syn) => (
              <Card key={syn.source}>
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Badge variant="outline">{syn.source}</Badge>
                    <span>→</span>
                    <Badge>{syn.target}</Badge>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => deleteSynonymMutation.mutate(syn.source)}
                  >
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="import">
          <TagImporter />
        </TabsContent>
      </Tabs>

      {/* Rename Dialog */}
      <Dialog open={!!renameTag} onOpenChange={(open) => !open && setRenameTag(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('tags.renameTag')}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>{t('tags.newName')}</Label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameTag(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={() =>
                renameTag && renameMutation.mutate({ id: renameTag.id, name: newName })
              }
              disabled={!newName || newName === renameTag?.name}
            >
              {t('common.rename')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Merge Dialog */}
      <Dialog open={!!mergeSource} onOpenChange={(open) => !open && setMergeSource(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('tags.mergeTag')}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <p>
              Merge <strong>{mergeSource?.name}</strong> into:
            </p>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              value={mergeTargetId}
              onChange={(e) => setMergeTargetId(e.target.value)}
            >
              <option value="">{t('tags.selectTarget')}</option>
              {tags
                ?.filter((t) => t.id !== mergeSource?.id && t.type === mergeSource?.type)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
            </select>
            <p className="text-sm text-muted-foreground">
              {t('tags.mergeDescription', { name: mergeSource?.name })}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMergeSource(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={() =>
                mergeSource &&
                mergeMutation.mutate({ sourceId: mergeSource.id, targetId: mergeTargetId })
              }
              disabled={!mergeTargetId}
            >
              {t('common.merge')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
