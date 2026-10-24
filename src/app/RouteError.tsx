import { useEffect, useState } from 'react';
import { useNavigate, useRouteError } from 'react-router';
import { useJamStore } from '@/state/jamStore';
import { Button, EmptyState, Page } from '@/ui/kit';
import { reloadApp } from './reloadApp';

export function RouteError() {
  const error = useRouteError();
  const navigate = useNavigate();
  const status = useJamStore((s) => s.status);
  const active = status === 'starting' || status === 'listening';
  const [online, setOnline] = useState(navigator.onLine);
  const [reloading, setReloading] = useState(false);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  const loadError =
    error instanceof Error &&
    /dynamically imported module|Importing a module script failed|Loading chunk|Unable to preload CSS/i.test(
      error.message,
    );

  return (
    <Page title="Unable to open this page">
      <EmptyState
        title={online ? 'This page couldn’t load' : 'You’re offline'}
        description={
          active
            ? 'Your jam is still running. Return to Listen and finish it before reloading.'
            : !online
              ? 'Reconnect to the internet, then reload to try again.'
              : loadError
                ? 'Keel may have updated, or the connection was interrupted. Reload to try again.'
                : 'Something went wrong while opening this page. Reload to try again.'
        }
        action={
          active ? (
            <Button variant="filled" onClick={() => navigate('/')}>
              Return to Listen
            </Button>
          ) : (
            <Button
              variant="filled"
              disabled={!online}
              loading={reloading}
              onClick={() => {
                setReloading(true);
                void reloadApp();
              }}
            >
              Reload Keel
            </Button>
          )
        }
      />
    </Page>
  );
}
