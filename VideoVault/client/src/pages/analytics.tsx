import { useVideoManager } from '@/hooks/use-video-manager';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    PieChart,
    Pie,
    Cell,
} from 'recharts';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatFileSize, formatDuration } from '@/lib/utils';
import { DirectoryDatabase } from '@/services/directory-database';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d', '#ffc658', '#8dd1e1', '#a4de6c', '#d0ed57'];

export default function AnalyticsPage() {
    const { t } = useTranslation();
    const { state } = useVideoManager();
    const { videos } = state;
    const [selectedRoot, setSelectedRoot] = useState<string>('all');
    const [dateRange, setDateRange] = useState<{ startDate: string; endDate: string }>({
        startDate: '',
        endDate: '',
    });

    const roots = useMemo(() => DirectoryDatabase.listRoots(), []);

    const filteredVideos = useMemo(() => {
        let res = videos;
        if (selectedRoot !== 'all') {
            res = res.filter((v) => v.rootKey === selectedRoot);
        }
        if (dateRange.startDate) {
            const start = new Date(dateRange.startDate).getTime();
            res = res.filter((v) => new Date(v.lastModified).getTime() >= start);
        }
        if (dateRange.endDate) {
            const end = new Date(dateRange.endDate).getTime() + 86400000; // End of day
            res = res.filter((v) => new Date(v.lastModified).getTime() < end);
        }
        return res;
    }, [videos, selectedRoot, dateRange]);

    const stats = useMemo(() => {
        const vids = filteredVideos;
        const totalVideos = vids.length;
        const totalSize = vids.reduce((acc, v) => acc + v.size, 0);
        const totalDuration = vids.reduce((acc, v) => acc + (v.metadata?.duration || 0), 0);

        // Category Distribution
        const categoryCounts: Record<string, number> = {};
        vids.forEach((v) => {
            // Count standard categories
            Object.entries(v.categories || {}).forEach(([type, values]) => {
                if (Array.isArray(values)) {
                    values.forEach((val) => {
                        const key = `${type}: ${val}`;
                        categoryCounts[key] = (categoryCounts[key] || 0) + 1;
                    });
                }
            });
            // Count custom categories
            Object.entries(v.customCategories || {}).forEach(([type, values]) => {
                if (Array.isArray(values)) {
                    values.forEach((val) => {
                        const key = `${type}: ${val}`;
                        categoryCounts[key] = (categoryCounts[key] || 0) + 1;
                    });
                }
            });
        });

        const topCategories = Object.entries(categoryCounts)
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 10);

        // Size Distribution
        const sizeBuckets = {
            '< 100MB': 0,
            '100MB - 500MB': 0,
            '500MB - 1GB': 0,
            '1GB - 5GB': 0,
            '> 5GB': 0,
        };

        vids.forEach((v) => {
            const mb = v.size / (1024 * 1024);
            if (mb < 100) sizeBuckets['< 100MB']++;
            else if (mb < 500) sizeBuckets['100MB - 500MB']++;
            else if (mb < 1024) sizeBuckets['500MB - 1GB']++;
            else if (mb < 5120) sizeBuckets['1GB - 5GB']++;
            else sizeBuckets['> 5GB']++;
        });

        const sizeData = Object.entries(sizeBuckets).map(([name, value]) => ({ name, value }));

        // Duration Distribution
        const durationBuckets = {
            '< 5m': 0,
            '5m - 20m': 0,
            '20m - 1h': 0,
            '> 1h': 0,
        };

        vids.forEach((v) => {
            const duration = v.metadata?.duration || 0;
            const minutes = duration / 60;
            if (minutes < 5) durationBuckets['< 5m']++;
            else if (minutes < 20) durationBuckets['5m - 20m']++;
            else if (minutes < 60) durationBuckets['20m - 1h']++;
            else durationBuckets['> 1h']++;
        });

        const durationData = Object.entries(durationBuckets).map(([name, value]) => ({ name, value }));

        return {
            totalVideos,
            totalSize,
            totalDuration,
            topCategories,
            sizeData,
            durationData,
        };
    }, [filteredVideos]);

    return (
        <div className="p-6 space-y-6 overflow-y-auto h-full bg-background">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <h1 className="text-3xl font-bold text-foreground">{t('analytics.title')}</h1>
                <div className="flex items-center gap-2 flex-wrap">
                    <Input
                        type="date"
                        value={dateRange.startDate}
                        onChange={(e) => setDateRange({ ...dateRange, startDate: e.target.value })}
                        className="w-auto"
                        aria-label="Start date"
                    />
                    <span className="text-muted-foreground">-</span>
                    <Input
                        type="date"
                        value={dateRange.endDate}
                        onChange={(e) => setDateRange({ ...dateRange, endDate: e.target.value })}
                        className="w-auto"
                        aria-label="End date"
                    />
                    <Select value={selectedRoot} onValueChange={setSelectedRoot}>
                        <SelectTrigger className="w-[200px]">
                            <SelectValue placeholder={t('analytics.filterByRoot')} />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">{t('analytics.allRoots')}</SelectItem>
                            {roots.map((r) => (
                                <SelectItem key={r.rootKey} value={r.rootKey}>
                                    {r.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">{t('analytics.totalVideos')}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.totalVideos}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">{t('analytics.totalSize')}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{formatFileSize(stats.totalSize)}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">{t('analytics.totalDuration')}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{formatDuration(stats.totalDuration)}</div>
                    </CardContent>
                </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Top Categories */}
                <Card>
                    <CardHeader>
                        <CardTitle>{t('analytics.topCategories')}</CardTitle>
                        <CardDescription>{t('analytics.topCategoriesDesc')}</CardDescription>
                    </CardHeader>
                    <CardContent className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={stats.topCategories}
                                    cx="50%"
                                    cy="50%"
                                    labelLine={false}
                                    label={({ name, percent }) => percent > 0.05 ? `${name} ${(percent * 100).toFixed(0)}%` : ''}
                                    outerRadius={80}
                                    fill="#8884d8"
                                    dataKey="value"
                                >
                                    {stats.topCategories.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip />
                            </PieChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>

                {/* File Size Distribution */}
                <Card>
                    <CardHeader>
                        <CardTitle>{t('analytics.fileSizeDistribution')}</CardTitle>
                        <CardDescription>{t('analytics.fileSizeDistributionDesc')}</CardDescription>
                    </CardHeader>
                    <CardContent className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={stats.sizeData}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="name" fontSize={12} tick={{ fill: 'currentColor' }} />
                                <YAxis tick={{ fill: 'currentColor' }} />
                                <Tooltip
                                    contentStyle={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
                                />
                                <Bar dataKey="value" fill="#8884d8" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>

                {/* Duration Distribution */}
                <Card>
                    <CardHeader>
                        <CardTitle>{t('analytics.durationDistribution')}</CardTitle>
                        <CardDescription>{t('analytics.durationDistributionDesc')}</CardDescription>
                    </CardHeader>
                    <CardContent className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={stats.durationData}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="name" fontSize={12} tick={{ fill: 'currentColor' }} />
                                <YAxis tick={{ fill: 'currentColor' }} />
                                <Tooltip
                                    contentStyle={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
                                />
                                <Bar dataKey="value" fill="#82ca9d" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
