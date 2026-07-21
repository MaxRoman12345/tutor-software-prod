'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LogoutButton } from '@/components/logout-button'

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  const navItems = [
    { href: '/student/dashboard', label: 'Dashboard' },
    { href: '/student/materials', label: 'Materials' },
    { href: '/student/lessons', label: 'Lessons' },
    { href: '/student/homework', label: 'Homework' },
  ]

  return (
    <div className="min-h-svh bg-white text-neutral-900">
      <header className="border-b border-neutral-200/80 sticky top-0 bg-white/80 backdrop-blur z-10">
        <div className="mx-auto max-w-5xl px-4 sm:px-5 h-14 flex items-center justify-between gap-3">
          <span className="font-semibold tracking-tight shrink-0">Systemised Maths</span>
          <div className="flex items-center gap-2 sm:gap-4 min-w-0">
            <nav className="flex items-center gap-1 text-sm overflow-x-auto min-w-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-3 py-1.5 rounded-full transition shrink-0 ${pathname.startsWith(item.href)
                    ? 'bg-neutral-900 text-white'
                    : 'text-neutral-500 hover:text-neutral-900'
                    }`}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
            <div className="shrink-0">
              <LogoutButton />
            </div>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 sm:px-5 py-6 sm:py-8">
        {children}
      </main>
    </div>
  )
}