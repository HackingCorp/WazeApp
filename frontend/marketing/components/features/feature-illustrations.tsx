"use client"

// 1. Disponibilité 24/7
function Illustration24_7() {
  return (
    <div className="relative w-full h-80 flex items-center justify-center overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-green-50 to-emerald-100 dark:from-green-950/30 dark:to-emerald-900/20 rounded-2xl" />

      {/* Clock face */}
      <div className="animate-float relative">
        <div className="w-40 h-40 rounded-full bg-white dark:bg-gray-800 shadow-xl border-4 border-green-200 dark:border-green-700 flex items-center justify-center relative">
          {/* Clock marks */}
          {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((deg) => (
            <div
              key={deg}
              className="absolute w-1 h-3 bg-gray-300 dark:bg-gray-600 rounded-full"
              style={{
                transform: `rotate(${deg}deg) translateY(-62px)`,
              }}
            />
          ))}
          {/* Hour hand */}
          <div className="absolute w-1.5 h-10 bg-gray-700 dark:bg-gray-300 rounded-full origin-bottom" style={{ transform: "rotate(-30deg) translateY(-20px)" }} />
          {/* Minute hand */}
          <div className="absolute w-1 h-14 bg-green-500 rounded-full origin-bottom" style={{ transform: "rotate(60deg) translateY(-28px)" }} />
          {/* Center dot */}
          <div className="w-3 h-3 rounded-full bg-green-500 z-10" />
        </div>

        {/* 24/7 badge */}
        <div className="animate-pulse-soft absolute -top-3 -right-3 bg-green-500 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-lg">
          24/7
        </div>
      </div>

      {/* Floating notification bubbles */}
      <div
        className="animate-float-xy absolute top-8 right-12 bg-white dark:bg-gray-800 rounded-xl shadow-lg px-3 py-2 flex items-center gap-2"
      >
        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
        <span className="text-xs text-gray-600 dark:text-gray-300 font-medium">02:30 AM</span>
        <span className="text-xs">&#10003;</span>
      </div>

      <div
        className="animate-float-xy-reverse absolute bottom-12 left-8 bg-white dark:bg-gray-800 rounded-xl shadow-lg px-3 py-2 flex items-center gap-2"
        style={{ animationDelay: "1s" }}
      >
        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
        <span className="text-xs text-gray-600 dark:text-gray-300 font-medium">11:45 PM</span>
        <span className="text-xs">&#10003;</span>
      </div>

      {/* Moon & Sun icons */}
      <div className="absolute top-6 left-8 text-2xl opacity-40">&#127769;</div>
      <div className="absolute bottom-8 right-10 text-2xl opacity-40">&#9728;&#65039;</div>
    </div>
  )
}

// 2. Support Multilingue
function IllustrationMultilingual() {
  const languages = [
    { flag: "&#127467;&#127479;", text: "Bonjour!", x: "left-6", y: "top-6" },
    { flag: "&#127468;&#127463;", text: "Hello!", x: "right-6", y: "top-10" },
    { flag: "&#127466;&#127480;", text: "Hola!", x: "left-10", y: "bottom-10" },
    { flag: "&#127465;&#127466;", text: "Hallo!", x: "right-8", y: "bottom-6" },
  ]

  return (
    <div className="relative w-full h-80 flex items-center justify-center overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-blue-950/30 dark:to-indigo-900/20 rounded-2xl" />

      {/* Globe */}
      <div className="animate-float relative">
        <div className="w-36 h-36 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 shadow-xl flex items-center justify-center relative overflow-hidden">
          {/* Globe lines */}
          <div className="absolute w-full h-full rounded-full border-2 border-white/30" />
          <div className="absolute w-24 h-full rounded-full border-2 border-white/20" />
          <div className="absolute w-12 h-full rounded-full border-2 border-white/15" />
          <div className="absolute w-full h-[1px] bg-white/25 top-1/2" />
          <div className="absolute w-full h-[1px] bg-white/20" style={{ top: "30%" }} />
          <div className="absolute w-full h-[1px] bg-white/20" style={{ top: "70%" }} />
          {/* Shine */}
          <div className="absolute top-3 left-5 w-6 h-6 rounded-full bg-white/20 blur-sm" />
        </div>
      </div>

      {/* Language bubbles */}
      {languages.map((lang, i) => (
        <div
          key={i}
          className={`animate-float absolute ${lang.x} ${lang.y} bg-white dark:bg-gray-800 rounded-xl shadow-lg px-3 py-2`}
          style={{ animationDelay: `${i * 0.4}s` }}
        >
          <div className="flex items-center gap-2">
            <span className="text-sm" dangerouslySetInnerHTML={{ __html: lang.flag }} />
            <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{lang.text}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

// 3. Réponses Instantanées
function IllustrationFastResponse() {
  return (
    <div className="relative w-full h-80 flex items-center justify-center overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-yellow-50 to-orange-100 dark:from-yellow-950/30 dark:to-orange-900/20 rounded-2xl" />

      <div className="animate-float-slow w-64">
        {/* Chat mockup */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl overflow-hidden">
          {/* Header */}
          <div className="bg-green-500 px-4 py-2.5 flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
              <span className="text-white text-xs font-bold">AI</span>
            </div>
            <div>
              <p className="text-white text-xs font-semibold">WazeBot</p>
              <p className="text-green-100 text-[10px]">en ligne</p>
            </div>
          </div>
          {/* Messages */}
          <div className="p-3 space-y-2">
            <div className="flex justify-end">
              <div className="bg-green-100 dark:bg-green-900/30 rounded-xl px-3 py-1.5 max-w-[80%]">
                <p className="text-xs text-gray-800 dark:text-gray-200">Quels sont vos horaires ?</p>
              </div>
            </div>
            <div className="flex justify-start">
              <div className="bg-gray-100 dark:bg-gray-700 rounded-xl px-3 py-1.5 max-w-[80%]">
                <p className="text-xs text-gray-800 dark:text-gray-200">Nous sommes ouverts du lundi au vendredi, 9h-18h !</p>
              </div>
            </div>
            {/* Typing speed indicator */}
            <div className="animate-pulse-soft flex items-center gap-1.5 ml-1">
              <svg className="w-3 h-3 text-yellow-500" fill="currentColor" viewBox="0 0 24 24">
                <path d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <span className="text-[10px] text-yellow-600 dark:text-yellow-400 font-semibold">&lt; 2s</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// 4. Base de Connaissances
function IllustrationKnowledgeBase() {
  return (
    <div className="relative w-full h-80 flex items-center justify-center overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-purple-50 to-violet-100 dark:from-purple-950/30 dark:to-violet-900/20 rounded-2xl" />

      <div className="animate-float relative">
        {/* Documents stack */}
        <div className="relative">
          {/* Back doc */}
          <div className="absolute -top-2 -left-2 w-44 h-52 bg-purple-200 dark:bg-purple-800/50 rounded-xl transform rotate-[-6deg]" />
          {/* Middle doc */}
          <div className="absolute -top-1 -left-1 w-44 h-52 bg-purple-100 dark:bg-purple-700/50 rounded-xl transform rotate-[-3deg]" />
          {/* Front doc */}
          <div className="relative w-44 h-52 bg-white dark:bg-gray-800 rounded-xl shadow-xl p-4">
            {/* Document content lines */}
            <div className="w-20 h-2.5 bg-purple-300 dark:bg-purple-600 rounded mb-3" />
            <div className="space-y-2">
              <div className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded" />
              <div className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded" />
              <div className="w-3/4 h-1.5 bg-gray-200 dark:bg-gray-700 rounded" />
              <div className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded" />
              <div className="w-5/6 h-1.5 bg-gray-200 dark:bg-gray-700 rounded" />
            </div>
            {/* Search icon overlay */}
            <div className="animate-pulse-soft absolute -bottom-3 -right-3 w-10 h-10 bg-purple-500 rounded-full shadow-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* File type badges */}
      <div
        className="animate-float absolute top-8 right-10 bg-white dark:bg-gray-800 rounded-lg shadow-md px-2 py-1.5 text-[10px] font-bold text-red-500"
        style={{ animationDelay: "0.3s" }}
      >
        PDF
      </div>
      <div
        className="animate-float absolute bottom-10 left-8 bg-white dark:bg-gray-800 rounded-lg shadow-md px-2 py-1.5 text-[10px] font-bold text-blue-500"
        style={{ animationDelay: "0.8s" }}
      >
        DOCX
      </div>
      <div
        className="animate-float absolute top-16 left-10 bg-white dark:bg-gray-800 rounded-lg shadow-md px-2 py-1.5 text-[10px] font-bold text-green-500"
        style={{ animationDelay: "1.2s" }}
      >
        CSV
      </div>
    </div>
  )
}

// 5. Gestion Multi-Agents
function IllustrationMultiAgents() {
  return (
    <div className="relative w-full h-80 flex items-center justify-center overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-cyan-50 to-teal-100 dark:from-cyan-950/30 dark:to-teal-900/20 rounded-2xl" />

      <div className="flex items-end gap-4">
        {[
          { name: "Ventes", color: "bg-green-500", size: "w-16 h-20", delay: 0 },
          { name: "Support", color: "bg-blue-500", size: "w-16 h-24", delay: 0.3 },
          { name: "RH", color: "bg-purple-500", size: "w-16 h-18", delay: 0.6 },
        ].map((agent, i) => (
          <div
            key={i}
            className="animate-float flex flex-col items-center gap-2"
            style={{ animationDelay: `${agent.delay}s` }}
          >
            <div className={`${agent.size} rounded-2xl ${agent.color} shadow-lg flex flex-col items-center justify-center p-2 relative`}>
              {/* Robot face */}
              <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center mb-1">
                <div className="flex gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-white" />
                  <div className="w-2 h-2 rounded-full bg-white" />
                </div>
              </div>
              <div className="w-4 h-1 rounded-full bg-white/40" />
              {/* Status indicator */}
              <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-green-400 border-2 border-white dark:border-gray-800" />
            </div>
            <span className="text-[10px] font-semibold text-gray-600 dark:text-gray-400">{agent.name}</span>
          </div>
        ))}
      </div>

      {/* Connection lines */}
      <div className="animate-pulse-soft absolute top-8 left-1/2 -translate-x-1/2 bg-white dark:bg-gray-800 rounded-full shadow-md px-3 py-1.5 flex items-center gap-1.5">
        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
        <span className="text-[10px] font-medium text-gray-600 dark:text-gray-300">3 agents actifs</span>
      </div>
    </div>
  )
}

// 6. Analytics Avancées
function IllustrationAnalytics() {
  const bars = [35, 55, 45, 70, 60, 80, 65]

  return (
    <div className="relative w-full h-80 flex items-center justify-center overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-emerald-50 to-green-100 dark:from-emerald-950/30 dark:to-green-900/20 rounded-2xl" />

      <div className="animate-float-slow w-64">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-4">
          {/* Mini dashboard header */}
          <div className="flex items-center justify-between mb-4">
            <div className="w-16 h-2 bg-gray-300 dark:bg-gray-600 rounded" />
            <div className="flex gap-1">
              <div className="w-2 h-2 rounded-full bg-green-400" />
              <div className="w-2 h-2 rounded-full bg-gray-300 dark:bg-gray-600" />
            </div>
          </div>

          {/* Bar chart */}
          <div className="flex items-end gap-1.5 h-24 mb-3">
            {bars.map((h, i) => (
              <div
                key={i}
                className="flex-1 bg-gradient-to-t from-green-500 to-emerald-400 rounded-t"
                style={{ height: `${h}%` }}
              />
            ))}
          </div>

          {/* Stats row */}
          <div className="flex gap-3">
            <div className="flex-1 bg-green-50 dark:bg-green-900/20 rounded-lg p-2">
              <p className="text-[10px] text-gray-500 dark:text-gray-400">Messages</p>
              <p className="text-sm font-bold text-green-600 dark:text-green-400">2,847</p>
            </div>
            <div className="flex-1 bg-blue-50 dark:bg-blue-900/20 rounded-lg p-2">
              <p className="text-[10px] text-gray-500 dark:text-gray-400">Satisfaction</p>
              <p className="text-sm font-bold text-blue-600 dark:text-blue-400">98%</p>
            </div>
          </div>
        </div>
      </div>

      {/* Floating metric */}
      <div
        className="animate-float absolute top-6 right-8 bg-white dark:bg-gray-800 rounded-lg shadow-md px-3 py-2"
        style={{ animationDelay: "0.5s" }}
      >
        <span className="text-green-500 text-xs font-bold">+24%</span>
        <span className="text-[10px] text-gray-500 ml-1">&#8593;</span>
      </div>
    </div>
  )
}

// 7. Sécurité & Confidentialité
function IllustrationSecurity() {
  return (
    <div className="relative w-full h-80 flex items-center justify-center overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-slate-50 to-gray-100 dark:from-slate-950/30 dark:to-gray-900/30 rounded-2xl" />

      <div className="animate-float relative">
        {/* Shield */}
        <div className="relative">
          <svg width="120" height="140" viewBox="0 0 120 140" className="drop-shadow-xl">
            <defs>
              <linearGradient id="shieldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#10B981" />
                <stop offset="100%" stopColor="#059669" />
              </linearGradient>
            </defs>
            <path
              d="M60 10 L110 35 L110 75 C110 105 85 130 60 138 C35 130 10 105 10 75 L10 35 Z"
              fill="url(#shieldGrad)"
            />
            <path
              d="M60 20 L100 40 L100 75 C100 100 80 120 60 128 C40 120 20 100 20 75 L20 40 Z"
              fill="white"
              fillOpacity="0.15"
            />
          </svg>
          {/* Lock icon */}
          <div className="absolute inset-0 flex items-center justify-center pt-2">
            <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" strokeWidth="2" />
              <path d="M7 11V7a5 5 0 0110 0v4" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
        </div>
      </div>

      {/* Encryption dots */}
      {[
        { x: "left-8", y: "top-12" },
        { x: "right-10", y: "top-16" },
        { x: "left-12", y: "bottom-14" },
        { x: "right-6", y: "bottom-10" },
      ].map((pos, i) => (
        <div
          key={i}
          className={`animate-blink-opacity absolute ${pos.x} ${pos.y} text-[10px] font-mono text-gray-400 dark:text-gray-500`}
          style={{ animationDelay: `${i * 0.3}s` }}
        >
          {["AES-256", "E2E", "SHA-512", "TLS 1.3"][i]}
        </div>
      ))}
    </div>
  )
}

// 8. IA Personnalisable
function IllustrationCustomAI() {
  return (
    <div className="relative w-full h-80 flex items-center justify-center overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-amber-50 to-yellow-100 dark:from-amber-950/30 dark:to-yellow-900/20 rounded-2xl" />

      <div className="animate-float-slow w-60">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-4 space-y-3">
          {/* Header */}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-yellow-500 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">Configuration IA</span>
          </div>

          {/* Sliders */}
          {[
            { label: "Ton", value: 75, color: "bg-amber-400" },
            { label: "Créativité", value: 60, color: "bg-yellow-400" },
            { label: "Précision", value: 90, color: "bg-orange-400" },
          ].map((slider, i) => (
            <div key={i} className="space-y-1">
              <div className="flex justify-between">
                <span className="text-[10px] text-gray-500 dark:text-gray-400">{slider.label}</span>
                <span className="text-[10px] font-medium text-gray-700 dark:text-gray-300">{slider.value}%</span>
              </div>
              <div className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className={`h-full ${slider.color} rounded-full`}
                  style={{ width: `${slider.value}%` }}
                />
              </div>
            </div>
          ))}

          {/* Toggle options */}
          <div className="flex gap-2 pt-1">
            {["Formel", "Amical", "Expert"].map((opt, i) => (
              <span
                key={i}
                className={`text-[10px] px-2 py-1 rounded-full ${
                  i === 1
                    ? "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 font-semibold"
                    : "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400"
                }`}
              >
                {opt}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// 9. Intégration WhatsApp
function IllustrationWhatsApp() {
  return (
    <div className="relative w-full h-80 flex items-center justify-center overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-green-50 to-emerald-100 dark:from-green-950/30 dark:to-emerald-900/20 rounded-2xl" />

      <div className="animate-float w-56">
        {/* WhatsApp phone mockup */}
        <div className="bg-gray-900 rounded-[24px] p-1.5 shadow-2xl">
          <div className="bg-white dark:bg-gray-800 rounded-[20px] overflow-hidden">
            {/* WhatsApp header */}
            <div className="bg-[#075E54] px-3 py-2 flex items-center gap-2">
              <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
              </svg>
              <div className="flex-1">
                <p className="text-white text-[10px] font-semibold">Mon Business</p>
                <p className="text-green-200 text-[8px]">en ligne</p>
              </div>
            </div>

            {/* Chat background */}
            <div className="bg-[#ECE5DD] dark:bg-gray-700 p-2 space-y-1.5 min-h-[120px]">
              <div className="flex justify-start">
                <div className="bg-white dark:bg-gray-600 rounded-lg px-2 py-1 max-w-[75%] shadow-sm">
                  <p className="text-[9px] text-gray-800 dark:text-gray-200">Salut ! Je cherche un produit</p>
                  <p className="text-[7px] text-gray-400 text-right">14:02</p>
                </div>
              </div>
              <div className="flex justify-end">
                <div className="bg-[#DCF8C6] dark:bg-green-800 rounded-lg px-2 py-1 max-w-[75%] shadow-sm">
                  <p className="text-[9px] text-gray-800 dark:text-gray-200">Bienvenue ! Je peux vous aider. Que recherchez-vous ?</p>
                  <p className="text-[7px] text-gray-400 text-right flex items-center justify-end gap-0.5">
                    14:02
                    <svg className="w-3 h-2 text-blue-500" viewBox="0 0 16 11" fill="currentColor">
                      <path d="M11.071.653a.457.457 0 0 0-.304-.102.493.493 0 0 0-.381.178l-6.19 7.636-2.011-2.095a.463.463 0 0 0-.686.007.52.52 0 0 0-.012.7l2.45 2.683a.467.467 0 0 0 .692-.007l6.54-8.103a.512.512 0 0 0-.098-.897z" />
                      <path d="M15.071.653a.457.457 0 0 0-.304-.102.493.493 0 0 0-.381.178l-6.19 7.636-1.2-1.25-.686.72 1.901 2.078a.467.467 0 0 0 .692-.007l6.54-8.103a.512.512 0 0 0-.098-.897z" />
                    </svg>
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* API connection badge */}
      <div
        className="animate-float absolute top-6 right-6 bg-white dark:bg-gray-800 rounded-lg shadow-md px-2.5 py-1.5 flex items-center gap-1.5"
      >
        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
        <span className="text-[10px] font-medium text-gray-600 dark:text-gray-300">API connectée</span>
      </div>
    </div>
  )
}

// Export map by feature index
// 10. Base de Connaissances Intelligente
function IllustrationSmartKB() {
  return (
    <div className="relative w-full h-80 flex items-center justify-center overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-50 to-blue-100 dark:from-indigo-950/30 dark:to-blue-900/20 rounded-2xl" />

      <div className="animate-float relative">
        {/* Brain + documents */}
        <div className="relative w-48 h-48 flex items-center justify-center">
          {/* Central brain/book */}
          <div className="w-28 h-28 bg-white dark:bg-gray-800 rounded-2xl shadow-xl flex items-center justify-center relative z-10">
            <svg className="w-14 h-14 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.331 0 4.512.89 6.042 2.36M12 6.042a8.967 8.967 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18c-2.331 0-4.512.89-6.042 2.36M12 6.042V20.4" />
            </svg>
            {/* AI sparkle */}
            <div className="animate-pulse-soft absolute -top-2 -right-2 w-8 h-8 bg-indigo-500 rounded-full shadow-lg flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2L9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2z" />
              </svg>
            </div>
          </div>

          {/* Orbiting documents */}
          <div className="animate-float absolute -top-2 -left-4 w-14 h-16 bg-white dark:bg-gray-700 rounded-lg shadow-md p-1.5" style={{ animationDelay: "0.2s" }}>
            <div className="w-6 h-1 bg-indigo-300 rounded mb-1" />
            <div className="w-full h-0.5 bg-gray-200 rounded mb-0.5" />
            <div className="w-full h-0.5 bg-gray-200 rounded mb-0.5" />
            <div className="w-3/4 h-0.5 bg-gray-200 rounded" />
          </div>
          <div className="animate-float absolute -bottom-4 -right-6 w-14 h-16 bg-white dark:bg-gray-700 rounded-lg shadow-md p-1.5" style={{ animationDelay: "0.7s" }}>
            <div className="w-6 h-1 bg-blue-300 rounded mb-1" />
            <div className="w-full h-0.5 bg-gray-200 rounded mb-0.5" />
            <div className="w-full h-0.5 bg-gray-200 rounded mb-0.5" />
            <div className="w-2/3 h-0.5 bg-gray-200 rounded" />
          </div>
        </div>
      </div>

      {/* Vector search indicator */}
      <div className="animate-float absolute top-6 right-8 bg-white dark:bg-gray-800 rounded-lg shadow-md px-2.5 py-1.5 flex items-center gap-1.5" style={{ animationDelay: "0.5s" }}>
        <svg className="w-3 h-3 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <span className="text-[10px] font-medium text-gray-600 dark:text-gray-300">Vector Search</span>
      </div>
      <div className="animate-float absolute bottom-8 left-8 bg-white dark:bg-gray-800 rounded-lg shadow-md px-2.5 py-1.5 flex items-center gap-1.5" style={{ animationDelay: "1s" }}>
        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
        <span className="text-[10px] font-medium text-gray-600 dark:text-gray-300">99.2% accuracy</span>
      </div>
    </div>
  )
}

// 11. Diffusion et Campagnes
function IllustrationBroadcast() {
  return (
    <div className="relative w-full h-80 flex items-center justify-center overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-orange-50 to-amber-100 dark:from-orange-950/30 dark:to-amber-900/20 rounded-2xl" />

      <div className="animate-float relative">
        {/* Megaphone */}
        <div className="relative">
          <div className="w-32 h-24 bg-white dark:bg-gray-800 rounded-2xl shadow-xl flex items-center justify-center">
            <svg className="w-14 h-14 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.34 15.84c-.688-.06-1.386-.09-2.09-.09H7.5a4.5 4.5 0 110-9h.75c.704 0 1.402-.03 2.09-.09m0 9.18c.253.962.584 1.892.985 2.783.247.55.06 1.21-.463 1.511l-.657.38c-.551.318-1.26.117-1.527-.461a20.845 20.845 0 01-1.44-4.282m3.102.069a18.03 18.03 0 01-.59-4.59c0-1.586.205-3.124.59-4.59m0 9.18a23.848 23.848 0 018.835 2.535M10.34 6.66a23.847 23.847 0 008.835-2.535m0 0A23.74 23.74 0 0018.795 3m.38 1.125a23.91 23.91 0 011.014 5.395m-1.014 8.855c-.118.38-.245.754-.38 1.125m.38-1.125a23.91 23.91 0 001.014-5.395m0-3.46c.495.413.811 1.035.811 1.73 0 .695-.316 1.317-.811 1.73m0-3.46a24.347 24.347 0 010 3.46" />
            </svg>
          </div>

          {/* Outgoing message waves */}
          <div className="absolute top-1/2 -right-16 -translate-y-1/2 space-y-2">
            <div className="animate-pulse w-8 h-0.5 bg-orange-300 rounded" style={{ animationDelay: "0s" }} />
            <div className="animate-pulse w-12 h-0.5 bg-orange-400 rounded" style={{ animationDelay: "0.3s" }} />
            <div className="animate-pulse w-6 h-0.5 bg-orange-300 rounded" style={{ animationDelay: "0.6s" }} />
          </div>
        </div>
      </div>

      {/* Contact bubbles spreading out */}
      {[
        { top: "top-6", pos: "right-12", delay: "0.2s", color: "bg-orange-100 dark:bg-orange-900/50" },
        { top: "top-12", pos: "right-6", delay: "0.5s", color: "bg-amber-100 dark:bg-amber-900/50" },
        { top: "bottom-12", pos: "right-10", delay: "0.8s", color: "bg-yellow-100 dark:bg-yellow-900/50" },
        { top: "bottom-8", pos: "right-20", delay: "1.1s", color: "bg-orange-100 dark:bg-orange-900/50" },
      ].map((item, i) => (
        <div
          key={i}
          className={`animate-float absolute ${item.top} ${item.pos} w-8 h-8 ${item.color} rounded-full shadow-sm flex items-center justify-center`}
          style={{ animationDelay: item.delay }}
        >
          <svg className="w-4 h-4 text-orange-500" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
          </svg>
        </div>
      ))}

      {/* Stats badge */}
      <div className="animate-float absolute bottom-6 left-6 bg-white dark:bg-gray-800 rounded-lg shadow-md px-2.5 py-1.5 flex items-center gap-1.5" style={{ animationDelay: "0.4s" }}>
        <span className="text-[10px] font-bold text-orange-500">12.4K</span>
        <span className="text-[10px] text-gray-500">envoyés</span>
      </div>
      <div className="animate-float absolute top-8 left-8 bg-white dark:bg-gray-800 rounded-lg shadow-md px-2.5 py-1.5 flex items-center gap-1.5" style={{ animationDelay: "0.9s" }}>
        <span className="text-[10px] font-bold text-green-500">94%</span>
        <span className="text-[10px] text-gray-500">délivrés</span>
      </div>
    </div>
  )
}

// 12. Escalade Humaine
function IllustrationEscalation() {
  return (
    <div className="relative w-full h-80 flex items-center justify-center overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-cyan-50 to-teal-100 dark:from-cyan-950/30 dark:to-teal-900/20 rounded-2xl" />

      <div className="animate-float relative flex items-center gap-4">
        {/* AI Bot */}
        <div className="w-20 h-20 bg-white dark:bg-gray-800 rounded-2xl shadow-lg flex flex-col items-center justify-center">
          <div className="w-8 h-8 bg-cyan-100 dark:bg-cyan-900/50 rounded-full flex items-center justify-center mb-1">
            <svg className="w-4 h-4 text-cyan-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
            </svg>
          </div>
          <span className="text-[8px] font-medium text-gray-500">AI Bot</span>
        </div>

        {/* Arrow with handover animation */}
        <div className="flex flex-col items-center">
          <div className="animate-pulse-soft bg-cyan-500 rounded-full px-3 py-1 mb-1">
            <span className="text-[8px] text-white font-bold">ESCALADE</span>
          </div>
          <svg className="w-8 h-4 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 12" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 6h14m0 0l-4-4m4 4l-4 4" />
          </svg>
        </div>

        {/* Human agent */}
        <div className="w-20 h-20 bg-white dark:bg-gray-800 rounded-2xl shadow-lg flex flex-col items-center justify-center">
          <div className="w-8 h-8 bg-teal-100 dark:bg-teal-900/50 rounded-full flex items-center justify-center mb-1">
            <svg className="w-4 h-4 text-teal-600" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
            </svg>
          </div>
          <span className="text-[8px] font-medium text-gray-500">Agent</span>
        </div>
      </div>

      {/* Context badge */}
      <div className="animate-float absolute bottom-8 left-1/2 -translate-x-1/2 bg-white dark:bg-gray-800 rounded-lg shadow-md px-3 py-1.5 flex items-center gap-1.5" style={{ animationDelay: "0.5s" }}>
        <svg className="w-3 h-3 text-teal-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
          </svg>
        <span className="text-[10px] text-gray-600 dark:text-gray-300">Contexte complet transféré</span>
      </div>

      {/* WhatsApp notification */}
      <div className="animate-float absolute top-6 right-8 bg-white dark:bg-gray-800 rounded-lg shadow-md px-2.5 py-1.5 flex items-center gap-1.5" style={{ animationDelay: "0.8s" }}>
        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
        <span className="text-[10px] text-gray-600 dark:text-gray-300">Notification envoyée</span>
      </div>
    </div>
  )
}

// 13. Vision & Voice AI
function IllustrationVisionVoice() {
  return (
    <div className="relative w-full h-80 flex items-center justify-center overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-rose-50 to-pink-100 dark:from-rose-950/30 dark:to-pink-900/20 rounded-2xl" />

      <div className="animate-float relative flex items-center gap-6">
        {/* Image analysis */}
        <div className="relative">
          <div className="w-24 h-24 bg-white dark:bg-gray-800 rounded-xl shadow-lg flex items-center justify-center overflow-hidden">
            {/* Simplified image placeholder */}
            <div className="w-16 h-16 bg-gradient-to-br from-rose-200 to-pink-300 dark:from-rose-800 dark:to-pink-700 rounded-lg flex items-center justify-center">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            {/* Scanning overlay */}
            <div className="animate-pulse-soft absolute inset-0 border-2 border-rose-400 rounded-xl opacity-50" />
          </div>
          <span className="text-[9px] font-medium text-gray-500 text-center block mt-1">Vision AI</span>
        </div>

        {/* Voice waveform */}
        <div className="relative">
          <div className="w-24 h-24 bg-white dark:bg-gray-800 rounded-xl shadow-lg flex items-center justify-center">
            <div className="flex items-end gap-0.5 h-12">
              {[3, 5, 8, 4, 7, 10, 6, 9, 3, 7, 5, 8, 4].map((h, i) => (
                <div
                  key={i}
                  className="animate-pulse w-1 bg-gradient-to-t from-rose-400 to-pink-500 rounded-full"
                  style={{
                    height: `${h * 4}px`,
                    animationDelay: `${i * 0.1}s`,
                  }}
                />
              ))}
            </div>
          </div>
          <span className="text-[9px] font-medium text-gray-500 text-center block mt-1">Voice AI</span>
        </div>
      </div>

      {/* Analysis results */}
      <div className="animate-float absolute top-6 right-8 bg-white dark:bg-gray-800 rounded-lg shadow-md px-2.5 py-1.5" style={{ animationDelay: "0.3s" }}>
        <span className="text-[10px] font-medium text-rose-500">Produit détecté :</span>
        <span className="text-[10px] text-gray-600 dark:text-gray-300"> iPhone 15</span>
      </div>
      <div className="animate-float absolute bottom-8 left-8 bg-white dark:bg-gray-800 rounded-lg shadow-md px-2.5 py-1.5 flex items-center gap-1.5" style={{ animationDelay: "0.7s" }}>
        <svg className="w-3 h-3 text-pink-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
        </svg>
        <span className="text-[10px] text-gray-600 dark:text-gray-300">Transcription terminée</span>
      </div>
    </div>
  )
}

// 14. Moteur Multi-IA
function IllustrationMultiLLM() {
  return (
    <div className="relative w-full h-80 flex items-center justify-center overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-violet-50 to-purple-100 dark:from-violet-950/30 dark:to-purple-900/20 rounded-2xl" />

      <div className="animate-float relative">
        {/* Central router hub */}
        <div className="w-20 h-20 bg-white dark:bg-gray-800 rounded-full shadow-xl flex items-center justify-center z-10 relative">
          <svg className="w-10 h-10 text-violet-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
          </svg>
        </div>

        {/* Connection lines to providers */}
        {[
          { angle: -60, label: "GPT-4", color: "text-emerald-500", bg: "bg-emerald-100 dark:bg-emerald-900/50" },
          { angle: 0, label: "DeepSeek", color: "text-blue-500", bg: "bg-blue-100 dark:bg-blue-900/50" },
          { angle: 60, label: "Mistral", color: "text-orange-500", bg: "bg-orange-100 dark:bg-orange-900/50" },
          { angle: 180, label: "Ollama", color: "text-gray-500", bg: "bg-gray-100 dark:bg-gray-700" },
        ].map((provider, i) => {
          const rad = (provider.angle * Math.PI) / 180
          const x = Math.cos(rad) * 80
          const y = Math.sin(rad) * 80
          return (
            <div
              key={i}
              className="absolute flex flex-col items-center"
              style={{
                left: `calc(50% + ${x}px - 24px)`,
                top: `calc(50% + ${y}px - 24px)`,
              }}
            >
              <div className={`animate-float w-12 h-12 ${provider.bg} rounded-xl shadow-md flex items-center justify-center`} style={{ animationDelay: `${i * 0.3}s` }}>
                <span className={`text-[8px] font-bold ${provider.color}`}>{provider.label}</span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Router badge */}
      <div className="animate-float absolute top-6 left-1/2 -translate-x-1/2 bg-white dark:bg-gray-800 rounded-lg shadow-md px-3 py-1.5 flex items-center gap-1.5" style={{ animationDelay: "0.5s" }}>
        <svg className="w-3 h-3 text-violet-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
        </svg>
        <span className="text-[10px] font-medium text-gray-600 dark:text-gray-300">Routage intelligent</span>
      </div>
      <div className="animate-float absolute bottom-6 left-8 bg-white dark:bg-gray-800 rounded-lg shadow-md px-2.5 py-1.5 flex items-center gap-1.5" style={{ animationDelay: "1s" }}>
        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
        <span className="text-[10px] text-gray-600 dark:text-gray-300">Fallback actif</span>
      </div>
    </div>
  )
}

const featureIllustrations = [
  Illustration24_7,
  IllustrationMultilingual,
  IllustrationFastResponse,
  IllustrationKnowledgeBase,
  IllustrationMultiAgents,
  IllustrationAnalytics,
  IllustrationSecurity,
  IllustrationCustomAI,
  IllustrationWhatsApp,
  IllustrationSmartKB,
  IllustrationBroadcast,
  IllustrationEscalation,
  IllustrationVisionVoice,
  IllustrationMultiLLM,
]

export default featureIllustrations
