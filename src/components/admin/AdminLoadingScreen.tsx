'use client'

export function AdminLoadingScreen() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-200 flex items-center justify-center">
      <div className="text-center">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center text-white text-2xl font-bold mb-4 mx-auto animate-pulse shadow-2xl">
          MT
        </div>
        <div className="text-slate-600 text-lg font-medium">
          Loading admin panel...
        </div>
      </div>
    </div>
  )
}
