"use client"

// Step 1: Connect WhatsApp (MessageSquare icon)
function IllustrationConnect() {
  return (
    <div className="relative w-full h-80 flex items-center justify-center overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-green-50 to-emerald-100 dark:from-green-950/30 dark:to-emerald-900/20 rounded-2xl" />

      <div className="animate-float relative">
        {/* Phone frame */}
        <div className="bg-gray-900 rounded-[28px] p-2 shadow-2xl">
          <div className="w-48 bg-white dark:bg-gray-800 rounded-[22px] overflow-hidden">
            {/* WhatsApp header */}
            <div className="bg-[#075E54] px-3 py-2 flex items-center gap-2">
              <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
              </svg>
              <span className="text-white text-[10px] font-semibold">WhatsApp Business</span>
            </div>

            {/* QR Code area */}
            <div className="p-4 flex flex-col items-center">
              <div className="w-28 h-28 bg-gray-100 dark:bg-gray-700 rounded-lg p-2 mb-3 grid grid-cols-5 grid-rows-5 gap-0.5">
                {Array.from({ length: 25 }).map((_, i) => (
                  <div
                    key={i}
                    className={`rounded-sm ${
                      [0,1,2,4,5,6,10,12,14,18,20,22,23,24].includes(i)
                        ? "bg-gray-800 dark:bg-gray-300"
                        : "bg-white dark:bg-gray-600"
                    }`}
                  />
                ))}
              </div>
              <p className="text-[8px] text-gray-500 dark:text-gray-400 text-center">Scannez le QR code</p>
            </div>
          </div>
        </div>
      </div>

      {/* Connection arrow */}
      <div
        className="animate-slide-arrow absolute top-1/2 right-8 -translate-y-1/2 flex items-center gap-1"
      >
        <div className="w-8 h-0.5 bg-green-400" />
        <div className="w-0 h-0 border-t-4 border-b-4 border-l-6 border-t-transparent border-b-transparent border-l-green-400" />
      </div>

      {/* Connected badge */}
      <div
        className="animate-pulse-soft absolute top-6 left-6 bg-white dark:bg-gray-800 rounded-xl shadow-lg px-3 py-2 flex items-center gap-2"
      >
        <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse" />
        <span className="text-xs font-semibold text-green-600 dark:text-green-400">Connect&eacute;</span>
      </div>
    </div>
  )
}

// Step 2: Configure AI Agent (Settings icon)
function IllustrationConfigure() {
  return (
    <div className="relative w-full h-80 flex items-center justify-center overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-blue-950/30 dark:to-indigo-900/20 rounded-2xl" />

      <div className="animate-float w-60">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl overflow-hidden">
          {/* Config header */}
          <div className="bg-gradient-to-r from-blue-500 to-indigo-500 px-4 py-2.5">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span className="text-white text-xs font-semibold">Configuration Agent</span>
            </div>
          </div>

          <div className="p-3 space-y-2.5">
            {/* Agent name */}
            <div>
              <label className="text-[9px] text-gray-500 dark:text-gray-400 uppercase tracking-wider">Nom</label>
              <div className="mt-0.5 bg-gray-50 dark:bg-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-gray-700 dark:text-gray-300">
                Assistant Commercial
              </div>
            </div>

            {/* Personality selector */}
            <div>
              <label className="text-[9px] text-gray-500 dark:text-gray-400 uppercase tracking-wider">Personnalité</label>
              <div className="mt-0.5 flex gap-1.5">
                {["Professionnel", "Amical", "Expert"].map((p, i) => (
                  <span key={p} className={`text-[9px] px-2 py-1 rounded-full ${i === 0 ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-semibold" : "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400"}`}>
                    {p}
                  </span>
                ))}
              </div>
            </div>

            {/* Language */}
            <div>
              <label className="text-[9px] text-gray-500 dark:text-gray-400 uppercase tracking-wider">Langue</label>
              <div className="mt-0.5 bg-gray-50 dark:bg-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                <span>&#127467;&#127479;</span> Français
              </div>
            </div>

            {/* Toggle */}
            <div className="flex items-center justify-between pt-1">
              <span className="text-[10px] text-gray-600 dark:text-gray-400">Base de connaissances</span>
              <div className="w-8 h-4 bg-blue-500 rounded-full relative">
                <div className="absolute right-0.5 top-0.5 w-3 h-3 bg-white rounded-full shadow" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// Step 3: Go Live / Automate (Zap icon)
function IllustrationGoLive() {
  return (
    <div className="relative w-full h-80 flex items-center justify-center overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-amber-50 to-orange-100 dark:from-amber-950/30 dark:to-orange-900/20 rounded-2xl" />

      {/* Central launch button */}
      <div className="animate-float relative">
        <div
          className="animate-pulse-glow w-28 h-28 rounded-full bg-gradient-to-br from-green-400 to-green-600 shadow-xl flex items-center justify-center"
        >
          <svg className="w-12 h-12 text-white" fill="currentColor" viewBox="0 0 24 24">
            <path d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>
      </div>

      {/* Flying messages */}
      {[
        { x: "right-6", y: "top-10", delay: 0 },
        { x: "left-8", y: "top-16", delay: 0.5 },
        { x: "right-10", y: "bottom-16", delay: 1 },
        { x: "left-6", y: "bottom-10", delay: 1.5 },
      ].map((msg, i) => (
        <div
          key={i}
          className={`animate-float absolute ${msg.x} ${msg.y} bg-white dark:bg-gray-800 rounded-xl shadow-lg px-3 py-2`}
          style={{ animationDelay: `${msg.delay}s` }}
        >
          <div className="flex items-center gap-1.5">
            <div className="w-5 h-5 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <svg className="w-3 h-3 text-green-500" viewBox="0 0 16 11" fill="currentColor">
                <path d="M11.071.653a.457.457 0 0 0-.304-.102.493.493 0 0 0-.381.178l-6.19 7.636-2.011-2.095a.463.463 0 0 0-.686.007.52.52 0 0 0-.012.7l2.45 2.683a.467.467 0 0 0 .692-.007l6.54-8.103a.512.512 0 0 0-.098-.897z" />
              </svg>
            </div>
            <span className="text-[10px] text-gray-600 dark:text-gray-300">Envoy&eacute;</span>
          </div>
        </div>
      ))}

      {/* Counter */}
      <div
        className="animate-pulse-soft absolute bottom-6 left-1/2 -translate-x-1/2 bg-white dark:bg-gray-800 rounded-full shadow-lg px-4 py-2 flex items-center gap-2"
      >
        <span className="text-xs font-bold text-green-600">1,247</span>
        <span className="text-[10px] text-gray-500">messages/jour</span>
      </div>
    </div>
  )
}

const howItWorksIllustrations = [
  IllustrationConnect,
  IllustrationConfigure,
  IllustrationGoLive,
]

export default howItWorksIllustrations
