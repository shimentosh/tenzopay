'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CartesianGrid, Line, LineChart, ReferenceDot, XAxis, YAxis } from 'recharts';
import { api } from '@/lib/api';
import { money } from '@/lib/utils';
import { Skeleton } from '@/components/ui/primitives';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ChartFrame } from '@/components/ui/patterns';
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
  const last = chartData[chartData.length - 1];
  const first = chartData[0];
  const dayLabel = (value?: string) =>
    value
      ? new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
      : '';

  return (
    <ChartFrame
      title={
        isLoading ? (
          <Skeleton className="h-6 w-28" />
        ) : (
          <span className="tnum text-value font-semibold text-content-primary">
            {money(data?.total ?? '0')}
            <span className="ml-1.5 font-normal text-content-tertiary">USDT spent</span>
          </span>
        )
      }
      rangeStart={dayLabel(first?.date)}
      rangeEnd="Today"
      action={
        <Tabs value={String(days)} onValueChange={(value) => setDays(Number(value) as 1 | 7 | 30)}>
          <TabsList>
            {ranges.map((range) => (
              <TabsTrigger key={range.days} value={String(range.days)}>
                {range.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      }
    >
      <div>
        {isLoading ? (
          <Skeleton className="h-44 w-full" />
        ) : hasSpend ? (
          <ChartContainer config={chartConfig} className="h-44 w-full">
            <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              {/* At most two dashed horizontal references, in hairline. */}
              <CartesianGrid
                vertical={false}
                horizontal
                strokeDasharray="4 4"
                stroke="var(--hairline)"
              />

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
                orientation="right"
                tickLine={false}
                axisLine={false}
                width={48}
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

              <Line
                type="monotone"
                dataKey="value"
                stroke="var(--chart-1)"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />

              {/* One filled dot with a soft halo marks the latest point. */}
              {last ? (
                <ReferenceDot
                  x={last.date}
                  y={last.value}
                  r={4}
                  fill="var(--chart-1)"
                  stroke="var(--surface-page)"
                  strokeWidth={3}
                />
              ) : null}
            </LineChart>
          </ChartContainer>
        ) : (
          <div className="flex h-44 items-center justify-center text-ui text-content-tertiary">
            No spending in this period
          </div>
        )}
      </div>
    </ChartFrame>
  );
}
