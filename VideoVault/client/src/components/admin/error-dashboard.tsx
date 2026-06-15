import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertTriangle, Bug, Clock, Download, RefreshCw, Trash2, Eye } from 'lucide-react';
import { getStoredErrors, clearStoredErrors, StoredError } from '@/lib/error-handler';
import { useErrorToast } from '@/components/ui/error-toast';

export function ErrorDashboard() {
  const [errors, setErrors] = useState<StoredError[]>([]);
  const [filteredErrors, setFilteredErrors] = useState<StoredError[]>([]);
  const [selectedSeverity, setSelectedSeverity] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedError, setSelectedError] = useState<StoredError | null>(null);
  const { showSuccess, showError } = useErrorToast();

  useEffect(() => {
    loadStoredErrors();
  }, []);

  useEffect(() => {
    let filtered = errors;

    // Filter by severity
    if (selectedSeverity !== 'all') {
      filtered = filtered.filter((error) => error.severity === selectedSeverity);
    }

    // Filter by search query
    if (searchQuery) {
      filtered = filtered.filter(
        (error) =>
          error.message.toLowerCase().includes(searchQuery.toLowerCase()) ||
          error.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
          error.userFriendly.title.toLowerCase().includes(searchQuery.toLowerCase()),
      );
    }

    setFilteredErrors(filtered);
  }, [errors, selectedSeverity, searchQuery]);

  const loadStoredErrors = () => {
    try {
      const storedErrors = getStoredErrors();
      setErrors(storedErrors);
    } catch {
      showError(new Error('Failed to load error logs'));
    }
  };

  const clearAllErrors = () => {
    try {
      clearStoredErrors();
      setErrors([]);
      setSelectedError(null);
      showSuccess('Cleared all error logs');
    } catch {
      showError(new Error('Failed to clear error logs'));
    }
  };

  const exportErrors = () => {
    try {
      const dataStr = JSON.stringify(errors, null, 2);
      const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);

      const exportFileDefaultName = `videovault-errors-${new Date().toISOString().split('T')[0]}.json`;

      const linkElement = document.createElement('a');
      linkElement.setAttribute('href', dataUri);
      linkElement.setAttribute('download', exportFileDefaultName);
      linkElement.click();

      showSuccess('Error logs exported successfully');
    } catch {
      showError(new Error('Failed to export error logs'));
    }
  };

  const groupErrorsBySeverity = () => {
    return errors.reduce(
      (acc, error) => {
        acc[error.severity] = (acc[error.severity] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );
  };

  const getRecentErrors = () => {
    return errors
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 5);
  };

  const severityStats = groupErrorsBySeverity();
  const recentErrors = getRecentErrors();

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Error Dashboard</h1>
          <p className="text-muted-foreground">Monitor and manage application errors</p>
        </div>
        <div className="flex space-x-2">
          <Button onClick={loadStoredErrors} variant="outline">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button onClick={exportErrors} variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
          <Button onClick={clearAllErrors} variant="destructive">
            <Trash2 className="h-4 w-4 mr-2" />
            Clear All
          </Button>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Errors</CardTitle>
            <Bug className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{errors.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Critical</CardTitle>
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{severityStats.critical || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">High Priority</CardTitle>
            <AlertTriangle className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{severityStats.high || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Recent (24h)</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {
                errors.filter(
                  (e) => new Date(e.timestamp).getTime() > Date.now() - 24 * 60 * 60 * 1000,
                ).length
              }
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="all" className="space-y-4">
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="all">All Errors</TabsTrigger>
            <TabsTrigger value="recent">Recent</TabsTrigger>
            <TabsTrigger value="critical">Critical</TabsTrigger>
          </TabsList>

          <div className="flex items-center space-x-2">
            <Input
              placeholder="Search errors..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-64"
            />
            <select
              value={selectedSeverity}
              onChange={(e) => setSelectedSeverity(e.target.value)}
              className="px-3 py-2 border rounded-md"
            >
              <option value="all">All Severities</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
        </div>

        <TabsContent value="all" className="space-y-4">
          <ErrorList errors={filteredErrors} onSelectError={setSelectedError} />
        </TabsContent>

        <TabsContent value="recent" className="space-y-4">
          <ErrorList errors={recentErrors} onSelectError={setSelectedError} />
        </TabsContent>

        <TabsContent value="critical" className="space-y-4">
          <ErrorList
            errors={filteredErrors.filter((e) => e.severity === 'critical')}
            onSelectError={setSelectedError}
          />
        </TabsContent>
      </Tabs>

      {/* Error Detail Modal/Panel */}
      {selectedError && (
        <ErrorDetailPanel error={selectedError} onClose={() => setSelectedError(null)} />
      )}
    </div>
  );
}

interface ErrorListProps {
  errors: StoredError[];
  onSelectError: (error: StoredError) => void;
}

function ErrorList({ errors, onSelectError }: ErrorListProps) {
  if (errors.length === 0) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-32">
          <div className="text-center text-muted-foreground">
            <Bug className="h-8 w-8 mx-auto mb-2" />
            <p>No errors found</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'destructive';
      case 'high':
        return 'secondary';
      case 'medium':
        return 'outline';
      case 'low':
        return 'outline';
      default:
        return 'outline';
    }
  };

  return (
    <div className="space-y-2">
      {errors.map((error) => (
        <Card key={error.id} className="cursor-pointer hover:shadow-md transition-shadow">
          <CardContent className="p-4" onClick={() => onSelectError(error)}>
            <div className="flex items-start justify-between">
              <div className="space-y-1 flex-1">
                <div className="flex items-center space-x-2">
                  <h3 className="font-medium">{error.userFriendly.title}</h3>
                  <Badge variant={getSeverityColor(error.severity)}>{error.severity}</Badge>
                  <Badge variant="outline">{error.code}</Badge>
                </div>
                <p className="text-sm text-muted-foreground line-clamp-2">{error.message}</p>
                <div className="flex items-center space-x-4 text-xs text-muted-foreground">
                  <span>{new Date(error.timestamp).toLocaleString()}</span>
                  {error.context?.component && <span>Component: {error.context.component}</span>}
                </div>
              </div>
              <Button variant="ghost" size="sm">
                <Eye className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

interface ErrorDetailPanelProps {
  error: StoredError;
  onClose: () => void;
}

function ErrorDetailPanel({ error, onClose }: ErrorDetailPanelProps) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-4xl max-h-[80vh] overflow-auto">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>{error.userFriendly.title}</CardTitle>
              <CardDescription>Error ID: {error.id}</CardDescription>
            </div>
            <Button onClick={onClose} variant="ghost" size="sm">
              ×
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <h4 className="font-medium mb-2">Severity</h4>
              <Badge variant={error.severity === 'critical' ? 'destructive' : 'secondary'}>
                {error.severity}
              </Badge>
            </div>
            <div>
              <h4 className="font-medium mb-2">Code</h4>
              <code className="bg-muted px-2 py-1 rounded text-sm">{error.code}</code>
            </div>
          </div>

          <div>
            <h4 className="font-medium mb-2">Message</h4>
            <p className="text-sm bg-muted p-3 rounded">{error.message}</p>
          </div>

          <div>
            <h4 className="font-medium mb-2">User Message</h4>
            <p className="text-sm">{error.userFriendly.message}</p>
            {error.userFriendly.actionable && (
              <p className="text-sm text-blue-600 mt-1">💡 {error.userFriendly.actionable}</p>
            )}
          </div>

          <div>
            <h4 className="font-medium mb-2">Timestamp</h4>
            <p className="text-sm">{new Date(error.timestamp).toLocaleString()}</p>
          </div>

          {error.context && (
            <div>
              <h4 className="font-medium mb-2">Context</h4>
              <pre className="bg-muted p-3 rounded text-xs overflow-auto">
                {JSON.stringify(error.context, null, 2)}
              </pre>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
