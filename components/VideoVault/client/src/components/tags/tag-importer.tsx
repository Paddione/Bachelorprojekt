import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Upload, FileText, CheckCircle2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';

export function TagImporter() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [csvContent, setCsvContent] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [result, setResult] = useState<{
    imported: number;
    errors: Array<{ line: string; error: string }>;
  } | null>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setCsvContent(text);
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (!csvContent.trim()) return;

    setIsImporting(true);
    setResult(null);

    try {
      const res = await fetch('/api/categories/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ csv: csvContent }),
      });

      if (!res.ok) {
        throw new Error('Import failed');
      }

      const data = (await res.json()) as {
        imported: number;
        errors: Array<{ line: string; error: string }>;
      };
      setResult({ imported: data.imported, errors: data.errors });

      if (data.imported > 0) {
        toast({
          title: 'Import Successful',
          description: `Imported ${data.imported} categories successfully.`,
        });
        void queryClient.invalidateQueries({ queryKey: ['tags'] });
      }
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Import Failed',
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Import Categories</CardTitle>
        <CardDescription>
          Import categories from a CSV file. Format: <code>type,value</code> (e.g.{' '}
          <code>age,Teen</code>).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid w-full max-w-sm items-center gap-1.5">
          <Label htmlFor="csv-file">Upload CSV</Label>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => document.getElementById('csv-file')?.click()}
              className="w-full"
            >
              <Upload className="mr-2 h-4 w-4" />
              Choose File
            </Button>
            <input
              id="csv-file"
              type="file"
              accept=".csv,.txt"
              className="hidden"
              onChange={handleFileUpload}
            />
          </div>
        </div>

        <div className="grid w-full gap-1.5">
          <Label htmlFor="csv-content">Or Paste CSV Content</Label>
          <Textarea
            id="csv-content"
            placeholder="type,value&#10;age,Adult&#10;genre,Action"
            value={csvContent}
            onChange={(e) => setCsvContent(e.target.value)}
            className="h-32 font-mono text-sm"
          />
        </div>

        <Button onClick={() => void handleImport()} disabled={isImporting || !csvContent.trim()}>
          {isImporting ? (
            <>Considering...</>
          ) : (
            <>
              <FileText className="mr-2 h-4 w-4" />
              Import Categories
            </>
          )}
        </Button>

        {result && (
          <div className="space-y-4 pt-4">
            <Alert variant={result.imported > 0 ? 'default' : 'destructive'}>
              <CheckCircle2 className="h-4 w-4" />
              <AlertTitle>Import Complete</AlertTitle>
              <AlertDescription>
                Successfully imported {result.imported} categories.
                {result.errors.length > 0 && ` Failed to import ${result.errors.length} lines.`}
              </AlertDescription>
            </Alert>

            {result.errors.length > 0 && (
              <div className="rounded-md bg-muted p-4">
                <p className="mb-2 font-medium text-sm">Errors:</p>
                <div className="max-h-32 overflow-y-auto text-xs font-mono">
                  {result.errors.map((err, i) => (
                    <div key={i} className="text-destructive">
                      Line: "{err.line}" - {err.error}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
