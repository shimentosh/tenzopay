import Link from 'next/link';
import { Button } from '@/components/ui/button';

export const metadata = {
  title: 'FAQ',
  description: 'Common questions about balances, cards and deposits.',
};

const faqs = [
  {
    q: 'Do I have to move money onto each card?',
    a: 'No. That is the central idea: cards are spending instruments, not separate wallets. Every card draws on the same available balance, and the limit you set on a card is a ceiling, not a pot of money you have to top up.',
  },
  {
    q: 'What stops five cards from spending five times my balance?',
    a: 'Every authorization is checked against your shared available balance at the moment it happens, before it is approved. Once your balance is committed, further authorizations are declined regardless of what each card’s individual limit allows.',
  },
  {
    q: 'What is the difference between “available” and “held”?',
    a: 'Held funds are reserved by authorizations that have not yet been captured — a hotel pre-authorization, for example. The money has left your available balance but has not been taken. If the merchant never captures, the hold is released back to you automatically.',
  },
  {
    q: 'Which network should I deposit on?',
    a: 'Use only the network shown on your deposit screen, and only USDT. Sending a different token, or the right token on a different network, means the funds cannot be recovered. The deposit screen states the network prominently for exactly this reason.',
  },
  {
    q: 'Why do deposits take time to appear?',
    a: 'A blockchain transaction can be reversed shortly after it is broadcast. We wait for a set number of confirmations before crediting your balance, so a deposit is never credited and then taken away. Progress is shown while it waits.',
  },
  {
    q: 'Can a deposit ever be credited twice?',
    a: 'No. Each on-chain transfer is recorded under a unique key made of its network, transaction hash and log position, and the ledger separately refuses to post the same event twice. Both checks would have to fail simultaneously.',
  },
  {
    q: 'Who can see my full card number?',
    a: 'Only you. When you reveal a card, the number and CVV are rendered directly in your browser by the card issuer. They are never sent to, stored by, or logged by TenzoPay, and support staff can only ever see the last four digits.',
  },
  {
    q: 'What happens when I freeze a card?',
    a: 'Freezing is sent to the card network immediately, so new authorizations are declined at the source rather than merely hidden in this app. Unfreezing restores it instantly. Closing a card, by contrast, is permanent.',
  },
  {
    q: 'Can staff change my balance?',
    a: 'Not directly. There is no control anywhere that sets a balance. A correction can only be posted as a signed adjustment with a written reason, which creates permanent paired entries and an audit record naming the person who made it.',
  },
  {
    q: 'Is TenzoPay a bank?',
    a: 'No. TenzoPay is a demonstration product built on sandbox infrastructure. It is not a bank, is not licensed as a money transmitter, and does not custody real funds. Deposits are simulated or testnet only, and this is labelled everywhere it appears.',
  },
  {
    q: 'Can I really spend my USDT on a card?',
    a: 'Not in this build, and we would rather say so plainly. Turning a stablecoin balance into funds a card network can settle against needs a licensed exchange partner and a sponsoring bank. The application layer is complete; that financial layer is not part of it.',
  },
];

export default function FaqPage() {
  return (
    <>
      <section className="border-b border-border bg-card">
        <div className="mx-auto max-w-3xl px-5 py-16 lg:py-20">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Frequently asked questions
          </h1>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-5 py-16">
        <dl className="divide-y divide-border">
          {faqs.map((faq) => (
            <div key={faq.q} className="py-6 first:pt-0">
              <dt className="font-semibold text-foreground">{faq.q}</dt>
              <dd className="mt-2 leading-relaxed text-muted-foreground">{faq.a}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-10 flex flex-wrap justify-center gap-3">
          <Button asChild>
            <Link href="/signup">Get started</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/security">Read about security</Link>
          </Button>
        </div>
      </section>
    </>
  );
}
