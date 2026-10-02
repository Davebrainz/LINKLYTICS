'use client'

import dynamic from 'next/dynamic'

const Linklytics = dynamic(() => import('../src/App'), {
  ssr: false,
  loading: () => <div className="loading-state">Loading Linklytics...</div>,
})

export default function HomePage() {
  return <Linklytics />
}