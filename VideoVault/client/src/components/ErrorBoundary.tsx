import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, RefreshCw, Home, Bug, Copy } from 'lucide-react';
import { handleError } from '@/lib/error-handler';
import { withTranslation, WithTranslation } from 'react-i18next';

interface Props extends WithTranslation {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
  errorId?: string;
  retryCount: number;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, retryCount: 0 };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Use the centralized error handler
    handleError(error, {
      operation: 'ErrorBoundary',
    });

    console.error('ErrorBoundary caught an error:', error, errorInfo);

    // Use existing requestId from error if available, otherwise generate one
    const errorId =
      (error as any).requestId ||
      `boundary_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    this.setState({
      error,
      errorInfo,
      errorId,
    });
  }

  handleRetry = () => {
    this.setState({
      hasError: false,
      error: undefined,
      errorInfo: undefined,
      errorId: undefined,
      retryCount: this.state.retryCount + 1,
    });
  };

  handleGoHome = () => {
    window.location.href = '/';
  };

  handleCopyError = () => {
    if (this.state.error && this.state.errorId) {
      const errorDetails = {
        errorId: this.state.errorId,
        message: this.state.error.message,
        stack: this.state.error.stack,
        componentStack: this.state.errorInfo?.componentStack,
        timestamp: new Date().toISOString(),
        url: window.location.href,
        userAgent: navigator.userAgent,
      };

      void navigator.clipboard.writeText(JSON.stringify(errorDetails, null, 2));
    }
  };

  handleReportIssue = () => {
    const issueUrl = `https://github.com/your-repo/issues/new?template=bug_report.md&title=Error Boundary: ${this.state.error?.message}&body=Error ID: ${this.state.errorId}`;
    window.open(issueUrl, '_blank');
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
          <Card className="w-full max-w-md">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
                <AlertTriangle className="h-6 w-6 text-destructive" />
              </div>
              <CardTitle className="text-xl">{this.props.t('errorBoundary.title')}</CardTitle>
              <CardDescription>
                {this.props.t('errorBoundary.description')}
                {this.state.errorId && (
                  <div className="mt-2 text-xs text-muted-foreground">
                    {this.props.t('errorBoundary.errorId')}{' '}
                    <code className="px-1 py-0.5 bg-muted rounded select-all">
                      {this.state.errorId}
                    </code>
                  </div>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {process.env.NODE_ENV === 'development' && this.state.error && (
                <details className="rounded-md bg-muted p-3 text-sm">
                  <summary className="cursor-pointer font-medium text-muted-foreground">
                    {this.props.t('errorBoundary.devDetails')}
                  </summary>
                  <div className="mt-2 font-mono text-xs">
                    <p className="text-destructive">{this.state.error.message}</p>
                    {this.state.errorInfo?.componentStack && (
                      <pre className="mt-2 whitespace-pre-wrap text-muted-foreground">
                        {this.state.errorInfo.componentStack}
                      </pre>
                    )}
                  </div>
                </details>
              )}

              <div className="space-y-3">
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button onClick={this.handleRetry} className="flex-1">
                    <RefreshCw className="mr-2 h-4 w-4" />
                    {this.props.t('errorBoundary.tryAgain')}
                  </Button>
                  <Button onClick={this.handleGoHome} variant="outline" className="flex-1">
                    <Home className="mr-2 h-4 w-4" />
                    {this.props.t('errorBoundary.goHome')}
                  </Button>
                </div>

                {this.state.retryCount > 2 && (
                  <div className="text-center text-sm text-muted-foreground">
                    <p>{this.props.t('errorBoundary.stillHavingIssues')}</p>
                  </div>
                )}

                <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
                  <Button
                    onClick={this.handleCopyError}
                    variant="ghost"
                    size="sm"
                    disabled={!this.state.errorId}
                  >
                    <Copy className="mr-2 h-4 w-4" />
                    {this.props.t('errorBoundary.copyError')}
                  </Button>
                  <Button onClick={this.handleReportIssue} variant="ghost" size="sm">
                    <Bug className="mr-2 h-4 w-4" />
                    {this.props.t('errorBoundary.reportIssue')}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}

export default withTranslation()(ErrorBoundary);
