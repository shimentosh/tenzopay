import Link from 'next/link';
import { Accordion, type AccordionEntry } from '@/components/marketing/ui/accordion';
import { Pill } from '@/components/marketing/ui/pill';
import { Reveal } from '@/components/marketing/ui/reveal';

const entries: AccordionEntry[] = [
  {
    question: 'What is a virtual card?',
    answer:
      'It is a card number issued to you instantly, with no plastic attached. You use it online exactly as you would a physical card, and because it costs nothing to create another one, you can give each merchant its own.',
  },
  {
    question: 'How fast do I get a card after signing up?',
    answer:
      'Immediately. Creating a card is a single form: name it, set its ceilings, and it exists. There is no queue, no approval step and no delivery to wait for.',
  },
  {
    question: 'Where are TenzoPay cards accepted?',
    answer:
      'Cards are issued on Visa, so they work where Visa works — which is most of the online world. Acceptance is the network’s, and any merchant that declines a virtual card will decline this one too.',
  },
  {
    question: 'What are the fees?',
    answer:
      'Starter is free and stays free. Team is $19 a month, and Business is priced on volume. Network and blockchain fees, where they apply, are shown to you before you confirm anything.',
  },
  {
    question: 'Can I use a card with Apple Pay or Google Pay?',
    answer:
      'Not in this build. Wallet provisioning needs tokenisation we have not wired up, and we would rather say so than list it as a feature. Cards work online and anywhere a number can be entered.',
  },
  {
    question: 'What happens if a card is compromised?',
    answer:
      'Freeze it. The freeze is sent to the network, so the next authorization is declined at source rather than merely hidden in the app. Unfreezing is just as immediate, and closing a card is permanent.',
  },
  {
    question: 'Can a business run its own card programme on this?',
    answer:
      'No. Multi-BIN programmes, white-labelling and sponsor-bank relationships are not part of this product and are not on offer. What exists is one account, one balance and many cards on it.',
  },
  {
    question: 'Can I really spend my USDT on a card?',
    answer:
      'Not in this build, and we would rather say so plainly. Turning a stablecoin balance into funds a card network can settle against needs a licensed exchange partner and a sponsoring bank. The application layer is complete; that financial layer is not part of it.',
  },
];

export function Faq() {
  return (
    <section aria-labelledby="faq-heading" className="bg-paper py-24 md:py-32">
      <div className="mx-auto grid w-full max-w-container gap-12 px-6 md:px-8 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
        <div>
          <Reveal>
            <Pill tone="mint">Questions</Pill>
          </Reveal>
          <Reveal delay={0.08}>
            <h2 id="faq-heading" className="mt-6 font-display text-h2 font-medium text-forest">
              Straight answers.
            </h2>
          </Reveal>
          <Reveal delay={0.16}>
            <p className="mt-5 max-w-sm text-body-lg text-moss">
              Including the ones where the answer is no.{' '}
              <Link
                href="/faq"
                className="rounded text-forest underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bright"
              >
                Read the full FAQ
              </Link>
              .
            </p>
          </Reveal>
        </div>

        <Reveal delay={0.24}>
          <Accordion items={entries} />
        </Reveal>
      </div>
    </section>
  );
}
