/**
 * Guest-side configuration.
 *
 * Every href here resolves to a route this app actually serves. There is no
 * public developer portal and no booking calendar, so the secondary call to
 * action points at the explainer page rather than at a URL that would 404.
 */
export const SITE = {
  brand: 'TenzoPay',
  tagline: 'One balance. Every card.',
  primaryCta: { label: 'Get your card', href: '/signup' },
  secondaryCta: { label: 'See how it works', href: '/how-it-works' },
  loginHref: '/login',
} as const;
