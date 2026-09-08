import {
  ArrowDownToLine,
  CreditCard,
  Gauge,
  LayoutDashboard,
  Plus,
  ReceiptText,
  Settings,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Pill } from '@/components/marketing/ui/pill';
import { Reveal, RevealGroup, RevealItem } from '@/components/marketing/ui/reveal';
import { CardMockup } from '@/components/marketing/ui/card-mockup';

const sidebar = [
  { label: 'Dashboard', icon: LayoutDashboard, active: true },
  { label: 'Cards', icon: CreditCard, active: false },
  { label: 'Deposit', icon: ArrowDownToLine, active: false },
  { label: 'Transactions', icon: ReceiptText, active: false },
  { label: 'Limits', icon: Gauge, active: false },
  { label: 'Settings', icon: Settings, active: false },
];

type Activity = {
  merchant: string;
  card: string;
  date: string;
  status: 'Settled' | 'Held' | 'Declined' | 'Refunded';
  amount: string;
};

const activity: Activity[] = [
  { merchant: 'Google Ads', card: 'Google Ads · 5528', date: '8 Sep, 14:02', status: 'Settled', amount: '−42.50' },
  { merchant: 'Netflix', card: 'Subscriptions · 1179', date: '8 Sep, 09:15', status: 'Held', amount: '−15.99' },
  { merchant: 'Figma', card: 'Subscriptions · 1179', date: '7 Sep, 22:41', status: 'Refunded', amount: '+12.00' },
  { merchant: 'Booking.com', card: 'Travel · 6034', date: '7 Sep, 18:30', status: 'Declined', amount: '−310.00' },
];

const statusTone: Record<Activity['status'], string> = {
  Settled: 'bg-mint text-forest',
  Held: 'bg-sand text-moss',
  Refunded: 'bg-bright/30 text-forest',
  Declined: 'bg-coral/40 text-forest',
};

export function ProductPreview() {
  return (
    <section id="preview" aria-labelledby="preview-heading" className="scroll-mt-24 bg-bone py-24 md:py-32">
      <div className="mx-auto w-full max-w-container px-6 md:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <Reveal>
            <Pill tone="light">The whole account on one screen</Pill>
          </Reveal>
          <Reveal delay={0.08}>
            <h2 id="preview-heading" className="mt-6 font-display text-h2 font-medium text-forest">
              One balance, every card, in order.
            </h2>
          </Reveal>
          <Reveal delay={0.16}>
            <p className="mx-auto mt-5 max-w-xl text-body-lg text-moss">
              Available and held are shown separately, because a hold is money reserved by a
              merchant and not yet taken. Nothing is a cached number — both are summed from the
              ledger on read.
            </p>
          </Reveal>
        </div>

        <Reveal delay={0.24} scale className="mt-14">
          <div className="overflow-x-auto rounded-4xl border border-edge bg-paper p-2 shadow-float">
            <div className="flex min-w-[46rem] gap-2">
              <aside className="w-48 shrink-0 rounded-3xl bg-bone p-4">
                <p className="px-3 pb-3 text-micro font-medium uppercase text-moss">Account</p>
                <ul className="space-y-1">
                  {sidebar.map((item) => (
                    <li key={item.label}>
                      <span
                        className={cn(
                          'flex items-center gap-3 rounded-full px-3 py-2 text-[0.8125rem]',
                          item.active ? 'bg-forest text-paper' : 'text-moss',
                        )}
                      >
                        <item.icon className="size-4" aria-hidden />
                        {item.label}
                      </span>
                    </li>
                  ))}
                </ul>
              </aside>

              <div className="flex-1 space-y-4 p-4">
                <div className="flex flex-wrap items-end justify-between gap-6 rounded-3xl border border-edge bg-bone p-6">
                  <div>
                    <p className="text-micro font-medium uppercase text-moss">Balance</p>
                    <p className="mt-2 font-display text-[2.25rem] font-medium tracking-[-0.02em] text-forest">
                      4,220.20 <span className="text-[1.25rem] text-moss">USDT</span>
                    </p>
                    <div className="mt-3 flex gap-6 text-[0.8125rem]">
                      <span className="text-moss">
                        Available <span className="font-medium text-forest">3,851.71</span>
                      </span>
                      <span className="text-moss">
                        On hold <span className="font-medium text-forest">368.49</span>
                      </span>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <span className="inline-flex items-center gap-2 rounded-full bg-bright px-4 py-2 text-[0.8125rem] font-medium text-forest">
                      <ArrowDownToLine className="size-4" aria-hidden />
                      Deposit
                    </span>
                    <span className="inline-flex items-center gap-2 rounded-full border border-edge bg-paper px-4 py-2 text-[0.8125rem] font-medium text-forest">
                      <Plus className="size-4" aria-hidden />
                      New card
                    </span>
                  </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
                  <div className="rounded-3xl border border-edge p-5">
                    <div className="flex items-center justify-between">
                      <p className="text-[0.9375rem] font-medium text-forest">Recent activity</p>
                      <span className="text-[0.75rem] text-moss">Newest first</span>
                    </div>

                    <RevealGroup className="mt-4 divide-y divide-edge" delayChildren={0.5}>
                      {activity.map((row) => (
                        <RevealItem key={row.merchant} y={12}>
                          <div className="flex items-center gap-4 py-3">
                            <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-mint text-[0.75rem] font-semibold text-forest">
                              {row.merchant.slice(0, 2).toUpperCase()}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[0.875rem] font-medium text-forest">
                                {row.merchant}
                              </span>
                              <span className="block truncate text-[0.75rem] text-moss">{row.card}</span>
                            </span>
                            <span className="hidden text-[0.75rem] text-moss sm:block">{row.date}</span>
                            <span
                              className={cn(
                                'rounded-full px-2.5 py-1 text-[0.6875rem] font-medium',
                                statusTone[row.status],
                              )}
                            >
                              {row.status}
                            </span>
                            <span className="w-20 text-right font-mono text-[0.8125rem] text-forest">
                              {row.amount}
                            </span>
                          </div>
                        </RevealItem>
                      ))}
                    </RevealGroup>
                  </div>

                  <div className="space-y-3">
                    <CardMockup tone="bright" last4="5528" holder="GOOGLE ADS" expiry="09/29" />
                    <CardMockup tone="forest" last4="1179" holder="SUBSCRIPTIONS" expiry="04/31" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Reveal>

        <Reveal delay={0.32}>
          <p className="mt-6 text-center text-[0.8125rem] text-moss">
            Sample data. Balances shown in a preview build are simulated.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
