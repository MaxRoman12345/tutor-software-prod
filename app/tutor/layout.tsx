'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LogoutButton } from '@/components/logout-button'

export default function TutorLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  const navItems = [
    { href: '/tutor/students', label: 'Students' },
    { href: '/tutor/materials', label: 'Materials' },
  ]

  return (
    <div className="min-h-svh bg-white text-neutral-900">
      <header className="border-b border-neutral-200/80 sticky top-0 bg-white/80 backdrop-blur z-10">
        <div className="mx-auto max-w-5xl px-4 sm:px-5 h-14 flex items-center justify-between gap-3">
          <span className="font-semibold tracking-tight">Systemised Maths</span>
          <div className="flex items-center gap-4 shrink-0">
            <nav className="flex items-center gap-1 text-sm">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-3 py-1.5 rounded-full transition ${pathname.startsWith(item.href)
                    ? 'bg-neutral-900 text-white'
                    : 'text-neutral-500 hover:text-neutral-900'
                    }`}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 sm:px-5 py-6 sm:py-8">
        {children}
      </main>
    </div>
  )
}