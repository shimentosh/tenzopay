'use client';

import { useMutation } from '@tanstack/react-query';
import { useEffect } from 'react';
import { ShieldCheck } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Alert, Skeleton } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';

/**
 * Secure card reveal.
 *
 * The card number and CVV are rendered by the ISSUER inside a sandboxed
 * iframe. They are never sent to TenzoPay's servers, never stored, and never
 * present in this application's DOM — which is precisely what keeps this
 * codebase outside PCI DSS scope.
 *
 * The session is short-lived and re-requested on each open, so a stale URL in
 * browser history is useless.
 */
export function RevealCardDialog({
  cardId,
  cardName,
  open,
  onOpenChange,
}: {
  cardId: string;
  cardName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const mutation = useMutation({
    mutationFn: () =>
      api.post<{ embedUrl: string; expiresAt: string }>(`/cards/${cardId}/reveal`),
  });

  useEffect(() => {
    if (open) mutation.mutate();
    else mutation.reset();
    // Intentionally keyed on `open` alone: re-running on mutation identity
    // would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const isMock = mutation.data?.embedUrl.startsWith('about:blank');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{cardName}</DialogTitle>
          <DialogDescription className="flex items-start gap-2">
            <ShieldCheck className="mt-px size-4 shrink-0 text-positive" aria-hidden />
            <span>
              Card details are shown directly by the card issuer. TenzoPay never
              receives or stores your card number.
            </span>
          </DialogDescription>
        </DialogHeader>

        {mutation.isPending ? (
          <Skeleton className="h-48 w-full rounded-card" />
        ) : mutation.isError ? (
          <Alert tone="critical">
            {mutation.error instanceof ApiError
              ? mutation.error.message
              : 'Card details are temporarily unavailable.'}
          </Alert>
        ) : isMock ? (
          <Alert tone="brand" title="Mock provider">
            This card was issued by the mock provider, which has no card secrets
            to display. Switch <code>CARD_PROVIDER</code> to <code>lithic</code>{' '}
            to see a real reveal iframe.
          </Alert>
        ) : mutation.data ? (
          <iframe
            src={mutation.data.embedUrl}
            title="Card details"
            className="h-48 w-full rounded-card border"
            // The issuer's frame needs scripts, nothing more.
            sandbox="allow-scripts allow-same-origin"
            referrerPolicy="no-referrer"
          />
        ) : null}

        <DialogFooter>
          <Button variant="secondary" className="w-full" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
