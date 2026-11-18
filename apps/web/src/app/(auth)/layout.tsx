import Link from 'next/link';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between p-6">
        <Link href="/" className="font-semibold tracking-tight">
          Impacto
        </Link>
      </header>
      <main id="main" className="flex flex-1 items-center justify-center px-6 pb-24">
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}
