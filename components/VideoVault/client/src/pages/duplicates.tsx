import { useQuery, useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { VideoCard } from '@/components/video/video-card';
import { Loader2, RefreshCw, ArrowLeft } from 'lucide-react';
import { Link } from 'wouter';
import { Video } from '@/types/video';
import { useVideoManager } from '@/hooks/use-video-manager';
import { useToast } from '@/hooks/use-toast';

interface DuplicateGroup {
    hash: string;
    count: number;
    videos: Video[];
}

interface DuplicatesResponse {
    fast: DuplicateGroup[];
    perceptual: DuplicateGroup[];
}

export default function DuplicatesPage() {
    const { t } = useTranslation();
    const { toast } = useToast();
    const { actions } = useVideoManager();

    const { data, isLoading, refetch } = useQuery<DuplicatesResponse>({
        queryKey: ['duplicates'],
        queryFn: async () => {
            const res = await fetch('/api/videos/duplicates');
            if (!res.ok) throw new Error('Failed to fetch duplicates');
            return res.json();
        }
    });

    const computeMutation = useMutation({
        mutationFn: async () => {
            const res = await fetch('/api/videos/compute-hashes', { method: 'POST' });
            if (!res.ok) throw new Error('Failed to compute hashes');
            return res.json();
        },
        onSuccess: (data) => {
            toast({
                title: t('duplicates.computationComplete'),
                description: t('duplicates.processed', { processed: data.processed, remaining: data.remaining }),
            });
            refetch();
        },
        onError: () => {
            toast({
                title: t('duplicates.computationFailed'),
                variant: 'destructive',
            });
        }
    });

    const ignoreMutation = useMutation({
        mutationFn: async ({ video1, video2 }: { video1: string; video2: string }) => {
            const res = await fetch('/api/videos/duplicates/ignore', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ video1, video2 }),
            });
            if (!res.ok) throw new Error('Failed to ignore duplicate');
            return res.json();
        },
        onSuccess: () => {
            toast({ title: t('duplicates.duplicateIgnored') });
            refetch();
        },
    });

    const handleDelete = async (video: Video) => {
        if (confirm(t('duplicates.confirmDelete', { name: video.displayName }))) {
            await actions.deleteFile(video.id);
            refetch();
        }
    };

    if (isLoading) return <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>;

    return (
        <div className="container mx-auto p-6 space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                    <Link href="/">
                        <Button variant="ghost"><ArrowLeft className="mr-2 h-4 w-4" /> {t('common.back')}</Button>
                    </Link>
                    <h1 className="text-2xl font-bold">{t('duplicates.title')}</h1>
                </div>
                <Button
                    onClick={() => computeMutation.mutate()}
                    disabled={computeMutation.isPending}
                >
                    {computeMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                    {t('duplicates.computeHashes')}
                </Button>
            </div>

            <div className="space-y-8">
                <section>
                    <h2 className="text-xl font-semibold mb-4">{t('duplicates.exactDuplicates')}</h2>
                    {data?.fast.length === 0 ? (
                        <p className="text-muted-foreground">{t('duplicates.noExactDuplicates')}</p>
                    ) : (
                        <div className="space-y-6">
                            {data?.fast.map((group) => (
                                <Card key={group.hash}>
                                    <CardHeader className="flex flex-row items-center justify-between">
                                        <CardTitle className="text-sm font-mono">{group.hash} ({group.count} copies)</CardTitle>
                                        {group.videos.length === 2 && (
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => ignoreMutation.mutate({ video1: group.videos[0].id, video2: group.videos[1].id })}
                                            >
                                                {t('duplicates.ignorePair')}
                                            </Button>
                                        )}
                                    </CardHeader>
                                    <CardContent>
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                            {group.videos.map((video) => (
                                                <div key={video.id} className="relative">
                                                    <VideoCard
                                                        video={video}
                                                        onPlay={() => { }}
                                                        onEditTags={() => { }}
                                                        onRename={() => { }}
                                                        onDelete={handleDelete}
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    )}
                </section>

                <section>
                    <h2 className="text-xl font-semibold mb-4">{t('duplicates.perceptualDuplicates')}</h2>
                    {data?.perceptual.length === 0 ? (
                        <p className="text-muted-foreground">{t('duplicates.noPerceptualDuplicates')}</p>
                    ) : (
                        <div className="space-y-6">
                            {data?.perceptual.map((group) => (
                                <Card key={group.hash}>
                                    <CardHeader className="flex flex-row items-center justify-between">
                                        <CardTitle className="text-sm font-mono">{group.hash} ({group.count} copies)</CardTitle>
                                        {group.videos.length === 2 && (
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => ignoreMutation.mutate({ video1: group.videos[0].id, video2: group.videos[1].id })}
                                            >
                                                {t('duplicates.ignorePair')}
                                            </Button>
                                        )}
                                    </CardHeader>
                                    <CardContent>
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                            {group.videos.map((video) => (
                                                <div key={video.id} className="relative">
                                                    <VideoCard
                                                        video={video}
                                                        onPlay={() => { }}
                                                        onEditTags={() => { }}
                                                        onRename={() => { }}
                                                        onDelete={handleDelete}
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
}
