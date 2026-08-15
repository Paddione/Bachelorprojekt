import { Switch, Route } from 'wouter';
import { queryClient } from './lib/queryClient';
import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ThemeProvider } from '@/components/ui/theme-provider';
import { ShortcutsOverlay } from '@/components/shortcuts/shortcuts-overlay';
import { HelpScreen } from '@/components/help-screen';
import ErrorBoundary from '@/components/ErrorBoundary';
import Home from '@/pages/home';
import AdminErrorsPage from '@/pages/admin-errors';
import DuplicatesPage from '@/pages/duplicates';
import TagsPage from '@/pages/tags';
import AnalyticsPage from '@/pages/analytics';
import FocusModePage from '@/pages/focus-mode';
import LoginPage from '@/pages/login';
import BrowsePage from '@/pages/browse';
import CategorizePage from '@/pages/categorize';
import CategoryManagerPage from '@/pages/category-manager';
import NotFound from '@/pages/not-found';
import { AuthService } from '@/services/auth';
import { useLocation } from 'wouter';
import { useEffect, useState } from 'react';

function ProtectedRoute({ component: Component, adminOnly = true, ...props }: any) {
  const [isAdmin, setIsAdmin] = useState(AuthService.cachedIsAdmin);
  const [, setLocation] = useLocation();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      const isA = await AuthService.refresh();
      setIsAdmin(isA);
      setLoading(false);
      if (!isA && adminOnly) {
        setLocation('/login');
      }
    })();
  }, [setLocation, adminOnly]);

  if (loading) return null;
  if (adminOnly && !isAdmin) return null;

  return <Component {...props} />;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/focus/:videoId" component={FocusModePage} />
      <Route path="/duplicates" component={DuplicatesPage} />
      <Route path="/tags" component={TagsPage} />
      <Route path="/analytics" component={AnalyticsPage} />
      <Route path="/browse" component={BrowsePage} />
      <Route path="/categorize/:videoId" component={CategorizePage} />
      <Route path="/categories/manage" component={CategoryManagerPage} />
      <Route path="/login" component={LoginPage} />
      <Route path="/admin/errors">
        {(params) => <ProtectedRoute component={AdminErrorsPage} {...params} />}
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider defaultTheme="dark">
          <TooltipProvider>
            <ShortcutsOverlay />
            <Toaster />
            <HelpScreen />
            <Router />
          </TooltipProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
