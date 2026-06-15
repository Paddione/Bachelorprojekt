import React from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { VideoVaultError, handleError, UserFriendlyError } from '@/lib/error-handler';
import {
  AlertCircle,
  RefreshCw,
  ExternalLink,
  Copy,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface ErrorToastProps {
  error: UserFriendlyError;
  errorId?: string;
  onRetry?: () => void;
  onDismiss?: () => void;
  showDetails?: boolean;
}

export function ErrorToast({
  error,
  errorId,
  onRetry,
  onDismiss,
  showDetails = false,
}: ErrorToastProps) {
  const { toast } = useToast();
  const [detailsOpen, setDetailsOpen] = React.useState(false);

  const handleCopyErrorId = () => {
    if (errorId) {
      void navigator.clipboard.writeText(errorId);
      toast({
        title: 'Copied',
        description: 'Error ID copied to clipboard',
        duration: 2000,
      });
    }
  };

  const handleReportIssue = () => {
    const issueUrl = `https://github.com/your-repo/issues/new?template=bug_report.md&title=Error: ${error.userFriendly.title}&body=Error ID: ${errorId}%0A%0A${encodeURIComponent(error.userFriendly.message)}`;
    window.open(issueUrl, '_blank');
  };

  const getSeverityColor = (code?: string) => {
    if (code?.includes('CRITICAL') || code?.includes('SECURITY')) return 'destructive';
    if (code?.includes('PERMISSION') || code?.includes('NETWORK')) return 'secondary';
    return 'outline';
  };

  return (
    <div className="max-w-md space-y-3 p-1">
      <div className="flex items-start space-x-3">
        <div className="flex-shrink-0">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-destructive/10">
            <AlertCircle className="h-4 w-4 text-destructive" />
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center space-x-2">
            <h4 className="text-sm font-medium text-foreground">{error.userFriendly.title}</h4>
            {error.code && (
              <Badge variant={getSeverityColor(error.code)} className="text-xs">
                {error.code}
              </Badge>
            )}
          </div>

          <p className="mt-1 text-sm text-muted-foreground">{error.userFriendly.message}</p>

          {error.userFriendly.actionable && (
            <div className="mt-2 p-2 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-md">
              <p className="text-xs text-blue-800 dark:text-blue-200 font-medium">
                💡 {error.userFriendly.actionable}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center justify-between pt-2">
        <div className="flex space-x-2">
          {error.userFriendly.recoverable && onRetry && (
            <Button size="sm" variant="outline" onClick={onRetry} className="h-7 text-xs">
              <RefreshCw className="h-3 w-3 mr-1" />
              Try Again
            </Button>
          )}

          {errorId && (
            <Button size="sm" variant="ghost" onClick={handleCopyErrorId} className="h-7 text-xs">
              <Copy className="h-3 w-3 mr-1" />
              Copy ID
            </Button>
          )}
        </div>

        <div className="flex space-x-2">
          {showDetails && errorId && (
            <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen}>
              <CollapsibleTrigger asChild>
                <Button size="sm" variant="ghost" className="h-7 text-xs px-2">
                  {detailsOpen ? (
                    <ChevronDown className="h-3 w-3" />
                  ) : (
                    <ChevronRight className="h-3 w-3" />
                  )}
                  Details
                </Button>
              </CollapsibleTrigger>
            </Collapsible>
          )}

          <Button size="sm" variant="ghost" onClick={handleReportIssue} className="h-7 text-xs">
            <ExternalLink className="h-3 w-3 mr-1" />
            Report
          </Button>
        </div>
      </div>

      {/* Error details collapsible */}
      {showDetails && (
        <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen}>
          <CollapsibleContent className="space-y-2">
            <div className="border-t pt-3">
              <div className="space-y-2 text-xs">
                {errorId && (
                  <div>
                    <span className="font-medium">Error ID:</span>
                    <code className="ml-2 px-1 py-0.5 bg-muted rounded text-xs">{errorId}</code>
                  </div>
                )}

                <div>
                  <span className="font-medium">Time:</span>
                  <span className="ml-2 text-muted-foreground">{new Date().toLocaleString()}</span>
                </div>

                <div>
                  <span className="font-medium">Page:</span>
                  <span className="ml-2 text-muted-foreground break-all">
                    {window.location.pathname}
                  </span>
                </div>
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}

// Helper hook to show error toasts
export function useErrorToast() {
  const { toast } = useToast();

  const showError = (
    error: Error | UserFriendlyError,
    options?: {
      onRetry?: () => void;
      context?: Record<string, any>;
      showDetails?: boolean;
    },
  ) => {
    let userError: UserFriendlyError;
    let errorId: string | undefined;

    if ('title' in error && 'message' in error && 'userFriendly' in error) {
      // Already a UserFriendlyError
      userError = error;
      errorId = error.id;
    } else {
      // Convert regular Error to UserFriendlyError by calling handleError (which handles the toast internally)
      // and create a local UserFriendlyError for display
      handleError(error as Error, options?.context);
      errorId = `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      userError = {
        id: errorId,
        timestamp: new Date().toISOString(),
        message: error.message,
        code: 'UNKNOWN_ERROR',
        severity: 'medium',
        userFriendly: {
          title: 'Error',
          message: error.message,
          recoverable: true,
        },
      };
    }

    toast({
      title: userError.userFriendly.title,
      description: (
        <ErrorToast
          error={userError}
          errorId={errorId}
          onRetry={options?.onRetry}
          showDetails={options?.showDetails || process.env.NODE_ENV === 'development'}
        />
      ),
      duration: userError.userFriendly.recoverable ? 8000 : 12000, // Give more time for recoverable errors
      variant: 'destructive',
    });

    return errorId;
  };

  const showSuccess = (title: string, message?: string) => {
    toast({
      title,
      description: message,
      duration: 4000,
    });
  };

  const showWarning = (title: string, message: string, actionable?: string) => {
    toast({
      title,
      description: (
        <div className="space-y-2">
          <p className="text-sm">{message}</p>
          {actionable && (
            <div className="p-2 bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800 rounded-md">
              <p className="text-xs text-yellow-800 dark:text-yellow-200">⚠️ {actionable}</p>
            </div>
          )}
        </div>
      ),
      duration: 6000,
    });
  };

  return {
    showError,
    showSuccess,
    showWarning,
  };
}
