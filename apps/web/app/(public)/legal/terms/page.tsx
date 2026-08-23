import { Alert } from "@/components/ui/Alert";

export const metadata = { title: "Terms and Conditions" };

export default function TermsPage() {
  return (
    <>
      <h1>Terms and Conditions</h1>
      <Alert variant="info">
        Placeholder terms for development purposes. This platform&apos;s operator must confirm applicable
        Ethiopian gambling/lottery licensing, consumer-protection, and taxation requirements with qualified
        legal counsel before real-money play is enabled. Nothing here constitutes legal advice.
      </Alert>

      <h2>1. Eligibility</h2>
      <p>
        You must be at least the minimum age configured by the platform (18 by default) and legally permitted
        to participate in games of chance in your jurisdiction to create an account.
      </p>

      <h2>2. One account per person</h2>
      <p>
        Each user may hold only one account. Creating multiple accounts to exploit games, bonuses, or
        promotions is prohibited and may result in suspension and forfeiture of winnings obtained through
        such accounts.
      </p>

      <h2>3. Wallet and funds</h2>
      <p>
        Deposits are held in your platform wallet and may be used to purchase Bingo tickets. All financial
        transactions are recorded in an immutable ledger and are auditable by the platform operator.
      </p>

      <h2>4. Game fairness</h2>
      <p>
        Bingo card numbers and the number-calling sequence are generated server-side using a cryptographically
        secure random process. Each game publishes a cryptographic commitment before it starts, which is
        revealed after completion so the sequence can be independently verified.
      </p>

      <h2>5. Account actions</h2>
      <p>
        The platform operator may suspend or restrict accounts suspected of fraud, collusion, or abuse of the
        payment or promotional systems, subject to review.
      </p>

      <h2>6. Changes</h2>
      <p>These terms may be updated. Continued use of the platform after changes constitutes acceptance.</p>
    </>
  );
}
