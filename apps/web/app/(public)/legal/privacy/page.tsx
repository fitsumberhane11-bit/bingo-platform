export const metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return (
    <>
      <h1>Privacy Policy</h1>
      <p>
        We collect the minimum information needed to operate your account: your name, username, email,
        phone number, hashed password, and transaction history. We do not store your payment credentials —
        deposits and withdrawals are processed through Telebirr and CBE, and we only retain the resulting
        transaction references.
      </p>

      <h2>What we store</h2>
      <ul>
        <li>Account details you provide at registration</li>
        <li>Wallet and transaction history</li>
        <li>Game and ticket history</li>
        <li>Login activity (IP address, device information) for security and fraud prevention</li>
      </ul>

      <h2>What we don&apos;t do</h2>
      <ul>
        <li>We never store your Telebirr or CBE PIN or credentials</li>
        <li>We do not sell your personal data to third parties</li>
      </ul>

      <h2>Your data</h2>
      <p>
        You may request a copy of your data or ask us to close your account by contacting support. Financial
        records are retained as required for auditing and dispute resolution even after account closure.
      </p>
    </>
  );
}
