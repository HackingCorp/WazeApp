"use client"

interface IllustrationProps {
  className?: string
}

// No Agents - Robot being assembled
export function NoAgentsIllustration({ className = "" }: IllustrationProps) {
  return (
    <div className={`flex justify-center ${className}`}>
      <div className="relative w-32 h-32">
        {/* Robot body */}
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-20 h-24 bg-gradient-to-b from-green-100 to-green-200 dark:from-green-900/30 dark:to-green-800/30 rounded-2xl border-2 border-green-300 dark:border-green-700 flex flex-col items-center justify-center">
          {/* Eyes */}
          <div className="flex gap-3 mb-2">
            <div className="w-3.5 h-3.5 rounded-full bg-green-500 dark:bg-green-400">
              <div className="w-1.5 h-1.5 rounded-full bg-white ml-1 mt-0.5" />
            </div>
            <div className="w-3.5 h-3.5 rounded-full bg-green-500 dark:bg-green-400">
              <div className="w-1.5 h-1.5 rounded-full bg-white ml-1 mt-0.5" />
            </div>
          </div>
          {/* Mouth */}
          <div className="w-6 h-1.5 bg-green-400 dark:bg-green-600 rounded-full" />
          {/* Antenna */}
          <div className="absolute -top-4 left-1/2 -translate-x-1/2 w-0.5 h-4 bg-green-400 dark:bg-green-600">
            <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-green-400 dark:bg-green-500" />
          </div>
        </div>
        {/* Plus icon */}
        <div className="absolute top-2 right-0 w-8 h-8 rounded-full bg-green-500 dark:bg-green-600 flex items-center justify-center shadow-lg">
          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
          </svg>
        </div>
        {/* Decorative dots */}
        <div className="absolute top-4 left-0 w-2 h-2 rounded-full bg-green-200 dark:bg-green-800" />
        <div className="absolute top-10 left-2 w-1.5 h-1.5 rounded-full bg-green-300 dark:bg-green-700" />
      </div>
    </div>
  )
}

// No Knowledge Base - Documents with magnifier
export function NoKnowledgeBaseIllustration({ className = "" }: IllustrationProps) {
  return (
    <div className={`flex justify-center ${className}`}>
      <div className="relative w-32 h-32">
        {/* Stacked documents */}
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2">
          <div className="absolute -top-1 -left-1 w-16 h-20 bg-blue-100 dark:bg-blue-900/30 rounded-lg border border-blue-200 dark:border-blue-700 transform rotate-[-6deg]" />
          <div className="relative w-16 h-20 bg-white dark:bg-gray-700 rounded-lg border-2 border-blue-300 dark:border-blue-600 p-2">
            <div className="w-8 h-1.5 bg-blue-300 dark:bg-blue-600 rounded mb-1.5" />
            <div className="w-full h-1 bg-gray-200 dark:bg-gray-600 rounded mb-1" />
            <div className="w-full h-1 bg-gray-200 dark:bg-gray-600 rounded mb-1" />
            <div className="w-3/4 h-1 bg-gray-200 dark:bg-gray-600 rounded mb-1" />
            <div className="w-full h-1 bg-gray-200 dark:bg-gray-600 rounded" />
          </div>
        </div>
        {/* Magnifier */}
        <div className="absolute top-0 right-2">
          <svg className="w-10 h-10 text-blue-400 dark:text-blue-500 drop-shadow-md" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="7" strokeWidth={2} />
            <path strokeLinecap="round" strokeWidth={2.5} d="M21 21l-4.35-4.35" />
          </svg>
        </div>
        {/* Decorative dots */}
        <div className="absolute bottom-0 left-2 w-2 h-2 rounded-full bg-blue-200 dark:bg-blue-800" />
        <div className="absolute top-8 left-0 w-1.5 h-1.5 rounded-full bg-blue-300 dark:bg-blue-700" />
      </div>
    </div>
  )
}

// No Products - Shopping bag
export function NoProductsIllustration({ className = "" }: IllustrationProps) {
  return (
    <div className={`flex justify-center ${className}`}>
      <div className="relative w-32 h-32">
        {/* Shopping bag */}
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-20 h-22">
          <div className="w-20 h-18 bg-gradient-to-b from-orange-100 to-orange-200 dark:from-orange-900/30 dark:to-orange-800/30 rounded-b-2xl rounded-t-lg border-2 border-orange-300 dark:border-orange-700 relative">
            {/* Bag handle */}
            <div className="absolute -top-4 left-1/2 -translate-x-1/2 w-10 h-5 border-2 border-orange-300 dark:border-orange-600 rounded-t-full border-b-0" />
            {/* Items inside */}
            <div className="flex justify-center pt-3 gap-1.5">
              <div className="w-4 h-6 bg-orange-300 dark:bg-orange-700 rounded-sm" />
              <div className="w-4 h-8 bg-orange-400 dark:bg-orange-600 rounded-sm" />
              <div className="w-4 h-5 bg-orange-300 dark:bg-orange-700 rounded-sm" />
            </div>
          </div>
        </div>
        {/* Plus badge */}
        <div className="absolute top-4 right-2 w-7 h-7 rounded-full bg-orange-500 dark:bg-orange-600 flex items-center justify-center shadow-md">
          <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
          </svg>
        </div>
        {/* Tag */}
        <div className="absolute top-2 left-2 w-5 h-7 bg-yellow-300 dark:bg-yellow-600 rounded-b-sm rounded-t-sm transform rotate-[-15deg]">
          <div className="w-1.5 h-1.5 rounded-full bg-white dark:bg-gray-800 mx-auto mt-1" />
        </div>
      </div>
    </div>
  )
}

// No Orders - Clipboard
export function NoOrdersIllustration({ className = "" }: IllustrationProps) {
  return (
    <div className={`flex justify-center ${className}`}>
      <div className="relative w-32 h-32">
        {/* Clipboard */}
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-20 h-24 bg-gradient-to-b from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-800/30 rounded-xl border-2 border-purple-300 dark:border-purple-700 p-2">
          {/* Clip at top */}
          <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-10 h-3 bg-purple-400 dark:bg-purple-600 rounded-t-md" />
          {/* Checklist items */}
          <div className="mt-2 space-y-2">
            {[true, true, false].map((checked, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <div className={`w-3 h-3 rounded border ${checked ? "bg-purple-400 dark:bg-purple-500 border-purple-500" : "border-purple-300 dark:border-purple-600"} flex items-center justify-center`}>
                  {checked && <svg className="w-2 h-2 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                </div>
                <div className={`h-1 ${checked ? "w-10 bg-purple-300 dark:bg-purple-600" : "w-8 bg-purple-200 dark:bg-purple-700"} rounded`} />
              </div>
            ))}
          </div>
        </div>
        {/* Decorative */}
        <div className="absolute top-6 right-2 w-2 h-2 rounded-full bg-purple-300 dark:bg-purple-700" />
        <div className="absolute top-2 left-4 w-1.5 h-1.5 rounded-full bg-purple-200 dark:bg-purple-800" />
      </div>
    </div>
  )
}

// No Invoices - Receipt/document
export function NoInvoicesIllustration({ className = "" }: IllustrationProps) {
  return (
    <div className={`flex justify-center ${className}`}>
      <div className="relative w-32 h-32">
        {/* Receipt */}
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-18 h-24 bg-white dark:bg-gray-700 rounded-t-lg border-2 border-gray-300 dark:border-gray-600 p-2" style={{ clipPath: "polygon(0 0, 100% 0, 100% 92%, 90% 100%, 80% 92%, 70% 100%, 60% 92%, 50% 100%, 40% 92%, 30% 100%, 20% 92%, 10% 100%, 0 92%)" }}>
          <div className="w-10 h-1.5 bg-green-300 dark:bg-green-600 rounded mb-2 mx-auto" />
          <div className="space-y-1.5">
            <div className="flex justify-between">
              <div className="w-6 h-1 bg-gray-200 dark:bg-gray-600 rounded" />
              <div className="w-4 h-1 bg-gray-300 dark:bg-gray-500 rounded" />
            </div>
            <div className="flex justify-between">
              <div className="w-8 h-1 bg-gray-200 dark:bg-gray-600 rounded" />
              <div className="w-3 h-1 bg-gray-300 dark:bg-gray-500 rounded" />
            </div>
            <div className="w-full h-px bg-gray-200 dark:bg-gray-600 my-1" />
            <div className="flex justify-between">
              <div className="w-5 h-1.5 bg-gray-300 dark:bg-gray-500 rounded font-bold" />
              <div className="w-5 h-1.5 bg-green-400 dark:bg-green-600 rounded" />
            </div>
          </div>
        </div>
        {/* Dollar sign */}
        <div className="absolute top-2 right-2 w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/30 border-2 border-green-300 dark:border-green-700 flex items-center justify-center">
          <span className="text-sm font-bold text-green-500 dark:text-green-400">$</span>
        </div>
      </div>
    </div>
  )
}

// No WhatsApp Connected - Phone with WhatsApp
export function NoWhatsAppIllustration({ className = "" }: IllustrationProps) {
  return (
    <div className={`flex justify-center ${className}`}>
      <div className="relative w-32 h-32">
        {/* Phone */}
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-16 h-24 bg-gray-800 dark:bg-gray-900 rounded-xl p-1">
          <div className="w-full h-full bg-white dark:bg-gray-700 rounded-lg flex flex-col items-center justify-center">
            {/* WhatsApp icon */}
            <div className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center mb-1">
              <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
              </svg>
            </div>
            <div className="w-8 h-1 bg-gray-200 dark:bg-gray-600 rounded mt-1" />
          </div>
        </div>
        {/* Connection indicator */}
        <div className="absolute top-4 right-0">
          <div className="flex items-center gap-0.5">
            <div className="w-1.5 h-3 bg-gray-300 dark:bg-gray-600 rounded-sm" />
            <div className="w-1.5 h-5 bg-gray-300 dark:bg-gray-600 rounded-sm" />
            <div className="w-1.5 h-7 bg-gray-300 dark:bg-gray-600 rounded-sm" />
          </div>
        </div>
        {/* Arrow */}
        <div className="absolute top-10 left-1 text-green-400 dark:text-green-500">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
        </div>
      </div>
    </div>
  )
}

// No Documents - Empty folder
export function NoDocumentsIllustration({ className = "" }: IllustrationProps) {
  return (
    <div className={`flex justify-center ${className}`}>
      <div className="relative w-32 h-32">
        {/* Folder */}
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2">
          {/* Folder tab */}
          <div className="w-8 h-3 bg-blue-300 dark:bg-blue-600 rounded-t-md ml-2" />
          {/* Folder body */}
          <div className="w-20 h-14 bg-gradient-to-b from-blue-200 to-blue-300 dark:from-blue-800/50 dark:to-blue-700/50 rounded-lg border-2 border-blue-300 dark:border-blue-600 flex items-center justify-center">
            <svg className="w-6 h-6 text-blue-400 dark:text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </div>
        </div>
        {/* Flying document */}
        <div className="absolute top-2 right-2 w-8 h-10 bg-white dark:bg-gray-700 rounded border border-gray-300 dark:border-gray-600 p-1 transform rotate-12">
          <div className="w-4 h-0.5 bg-gray-300 dark:bg-gray-500 rounded mb-0.5" />
          <div className="w-full h-0.5 bg-gray-200 dark:bg-gray-600 rounded mb-0.5" />
          <div className="w-full h-0.5 bg-gray-200 dark:bg-gray-600 rounded" />
        </div>
      </div>
    </div>
  )
}

// No Templates - Message template
export function NoTemplatesIllustration({ className = "" }: IllustrationProps) {
  return (
    <div className={`flex justify-center ${className}`}>
      <div className="relative w-32 h-32">
        {/* Message template */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-22 h-18 bg-white dark:bg-gray-700 rounded-xl border-2 border-dashed border-green-300 dark:border-green-600 p-2 flex flex-col items-center justify-center">
          <div className="w-12 h-1.5 bg-green-200 dark:bg-green-700 rounded mb-2" />
          <div className="w-16 h-1 bg-gray-200 dark:bg-gray-600 rounded mb-1" />
          <div className="w-14 h-1 bg-gray-200 dark:bg-gray-600 rounded mb-1" />
          <div className="w-10 h-1 bg-gray-200 dark:bg-gray-600 rounded" />
        </div>
        {/* Sparkle */}
        <div className="absolute top-4 right-4">
          <svg className="w-6 h-6 text-green-400 dark:text-green-500" fill="currentColor" viewBox="0 0 24 24">
            <path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
        </div>
        <div className="absolute top-8 left-2 w-2 h-2 rounded-full bg-green-200 dark:bg-green-800" />
      </div>
    </div>
  )
}
