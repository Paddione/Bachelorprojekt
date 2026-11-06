import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell, type PieLabelRenderProps,
} from 'recharts';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useVideoManager } from '@/hooks/use-video-manager';
import { formatFileSize, formatDuration } from '@/lib/utils';
import { DirectoryDatabase } from '@/services/directory-database';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { AnalyticsStats, COLORS, DateRange, StatBucket, computeStats, filterVideos } from './analytics-queries';

function FilterBar({ range, setRange, root, setRoot }: {
  range: DateRange; setRange: (r: DateRange) => void; root: string; setRoot: (r: string) => void;
}) {
  const { t } = useTranslation();
  const roots = useMemo(() => DirectoryDatabase.listRoots(), []);
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Input type="date" value={range.startDate} onChange={(e) => setRange({ ...range, startDate: e.target.value })}
        className="w-auto" aria-label="Start date" />
      <span className="text-muted-foreground">-</span>
      <Input type="date" value={range.endDate} onChange={(e) => setRange({ ...range, endDate: e.target.value })}
        className="w-auto" aria-label="End date" />
      <Select value={root} onValueChange={setRoot}>
        <SelectTrigger className="w-[200px]">
          <SelectValue placeholder={t('analytics.filterByRoot')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('analytics.allRoots')}</SelectItem>
          {roots.map((r) => (
            <SelectItem key={r.rootKey} value={r.rootKey}>{r.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function SummaryCards({ stats }: { stats: AnalyticsStats }) {
  const { t } = useTranslation();
  const cards = [
    { title: t('analytics.totalVideos'), value: String(stats.totalVideos) },
    { title: t('analytics.totalSize'), value: formatFileSize(stats.totalSize) },
    { title: t('analytics.totalDuration'), value: formatDuration(stats.totalDuration) },
  ];
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {cards.map((c) => (
        <Card key={c.title}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{c.title}</CardTitle>
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{c.value}</div></CardContent>
        </Card>
      ))}
    </div>
  );
}

function TopCategoriesChart({ data }: { data: StatBucket[] }) {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('analytics.topCategories')}</CardTitle>
        <CardDescription>{t('analytics.topCategoriesDesc')}</CardDescription>
      </CardHeader>
      <CardContent className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} cx="50%" cy="50%" labelLine={false}
              label={({ name, percent }: PieLabelRenderProps) => {
                const pct = percent ?? 0;
                return pct > 0.05 ? `${name} ${(pct * 100).toFixed(0)}%` : '';
              }}
              outerRadius={80} fill="#8884d8" dataKey="value">
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

function BucketChart({ title, desc, data, fill }: { title: string; desc: string; data: StatBucket[]; fill: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{desc}</CardDescription>
      </CardHeader>
      <CardContent className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" fontSize={12} tick={{ fill: 'currentColor' }} />
            <YAxis tick={{ fill: 'currentColor' }} />
            <Tooltip contentStyle={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)', color: 'var(--foreground)' }} />
            <Bar dataKey="value" fill={fill} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

export default function AnalyticsPage() {
  const { t } = useTranslation();
  const { state } = useVideoManager();
  const [selectedRoot, setSelectedRoot] = useState<string>('all');
  const [dateRange, setDateRange] = useState<DateRange>({ startDate: '', endDate: '' });

  const filtered = useMemo(
    () => filterVideos(state.videos, selectedRoot, dateRange),
    [state.videos, selectedRoot, dateRange],
  );
  const stats = useMemo(() => computeStats(filtered), [filtered]);

  return (
    <div className="p-6 space-y-6 overflow-y-auto h-full bg-background">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-3xl font-bold text-foreground">{t('analytics.title')}</h1>
        <FilterBar range={dateRange} setRange={setDateRange} root={selectedRoot} setRoot={setSelectedRoot} />
      </div>
      <SummaryCards stats={stats} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <TopCategoriesChart data={stats.topCategories} />
        <BucketChart title={t('analytics.fileSizeDistribution')} desc={t('analytics.fileSizeDistributionDesc')}
          data={stats.sizeData} fill="#8884d8" />
        <BucketChart title={t('analytics.durationDistribution')} desc={t('analytics.durationDistributionDesc')}
          data={stats.durationData} fill="#82ca9d" />
      </div>
    </div>
  );
}
