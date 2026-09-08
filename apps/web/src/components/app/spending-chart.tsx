'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { api } from '@/lib/api';
import { money } from '@/lib/utils';
import { Skeleton } from '@/components/ui/primitives';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';

interface Spending {
  days: number;
  total: string;
  points: { date: string; amount: string }[];
}

const ranges = [
  { days: 1, label: 'Today' },
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
] as const;

const chartConfig = {
  value: {
    label: 'Spent',
    color: 'var(--chart-1)',
  },
} satisfies ChartConfig;

export function SpendingChart() {
  const [days, setDays] = useState<1 | 7 | 30>(30);

  const { data, isLoading } = useQuery({
    queryKey: ['spending', days],
    queryFn: () => api.get<Spending>(`/transactions/spending?days=${days}`),
  });

  // Recharts needs plain numbers, so minor units are scaled here for the axis
  // only. The displayed total still comes from the exact string value.
  const chartData =
    data?.points.map((point) => ({
      date: point.date,
      value: Number(BigInt(point.amount) / 10_000n) / 100,
    })) ?? [];

  const hasSpend = chartData.some((point) => point.value > 0);

  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Total spent
          </p>
          {isLoading ? (
            <Skeleton className="mt-2 h-8 w-32" />
          ) : (
            <p className="tnum mt-1 text-2xl font-semibold text-foreground">
              {money(data?.total ?? '0')}
              <span className="ml-1.5 text-sm font-medium text-muted-foreground">
                USDT
              </span>
            </p>
          )}
        </div>

        <Tabs
          value={String(days)}
          onValueChange={(value) => setDays(Number(value) as 1 | 7 | 30)}
        >
          <TabsList>
            {ranges.map((range) => (
              <TabsTrigger key={range.days} value={String(range.days)}>
                {range.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      <div className="mt-5">
        {isLoading ? (
          <Skeleton className="h-44 w-full" />
        ) : hasSpend ? (
          <ChartContainer config={chartConfig} className="h-44 w-full">
            <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -18 }}>
              <defs>
                <linearGradient id="spendFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.26} />
                  <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                </linearGradient>
              </defs>

              <CartesianGrid vertical={false} strokeDasharray="3 3" />

              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={28}
                tickFormatter={(value: string) =>
                  new Date(value).toLocaleDateString(undefined, {
                    day: 'numeric',
                    month: 'short',
                  })
                }
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={54}
                tickFormatter={(value: number) =>
                  value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(value)
                }
              />

              <ChartTooltip
                cursor={{ strokeDasharray: 4 }}
                content={
                  <ChartTooltipContent
                    labelFormatter={(label) =>
                      new Date(String(label)).toLocaleDateString(undefined, {
                        weekday: 'short',
                        day: 'numeric',
                        month: 'long',
                      })
                    }
                    formatter={(value) => (
                      <span className="tnum">
                        {Number(value).toFixed(2)} USDT
                      </span>
                    )}
                  />
                }
              />

              <Area
                type="monotone"
                dataKey="value"
                stroke="var(--chart-1)"
                strokeWidth={2}
                fill="url(#spendFill)"
              />
            </AreaChart>
          </ChartContainer>
        ) : (
          <div className="flex h-44 items-center justify-center text-sm text-muted-foreground">
            No spending in this period
          </div>
        )}
      </div>
    </div>
  );
}
