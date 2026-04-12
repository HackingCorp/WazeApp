"use client"

import { motion } from "framer-motion"

const float = {
  animate: {
    y: [0, -8, 0],
    transition: { duration: 3, repeat: Infinity, ease: "easeInOut" },
  },
}

const floatSlow = {
  animate: {
    y: [0, -6, 0],
    transition: { duration: 4, repeat: Infinity, ease: "easeInOut", delay: 0.5 },
  },
}

const pulse = {
  animate: {
    scale: [1, 1.05, 1],
    opacity: [0.7, 1, 0.7],
    transition: { duration: 2, repeat: Infinity, ease: "easeInOut" },
  },
}

// 1. Disponibilité 24/7
function Illustration24_7() {
  return (
    <div className="relative w-full h-80 flex items-center justify-center overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-green-50 to-emerald-100 dark:from-green-950/30 dark:to-emerald-900/20 rounded-2xl" />

      {/* Clock face */}
      <motion.div {...float} className="relative">
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
        <motion.div {...pulse} className="absolute -top-3 -right-3 bg-green-500 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-lg">
          24/7
        </motion.div>
      </motion.div>

      {/* Floating notification bubbles */}
      <motion.div
        animate={{ y: [0, -10, 0], x: [0, 3, 0] }}
        transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
        className="absolute top-8 right-12 bg-white dark:bg-gray-800 rounded-xl shadow-lg px-3 py-2 flex items-center gap-2"
      >
        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
        <span className="text-xs text-gray-600 dark:text-gray-300 font-medium">02:30 AM</span>
        <span className="text-xs">&#10003;</span>
      </motion.div>

      <motion.div
        animate={{ y: [0, -8, 0], x: [0, -3, 0] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut", delay: 1 }}
        className="absolute bottom-12 left-8 bg-white dark:bg-gray-800 rounded-xl shadow-lg px-3 py-2 flex items-center gap-2"
      >
        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
        <span className="text-xs text-gray-600 dark:text-gray-300 font-medium">11:45 PM</span>
        <span className="text-xs">&#10003;</span>
      </motion.div>

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
      <motion.div {...float} className="relative">
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
      </motion.div>

      {/* Language bubbles */}
      {languages.map((lang, i) => (
        <motion.div
          key={i}
          animate={{ y: [0, -6, 0] }}
          transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut", delay: i * 0.4 }}
          className={`absolute ${lang.x} ${lang.y} bg-white dark:bg-gray-800 rounded-xl shadow-lg px-3 py-2`}
        >
          <div className="flex items-center gap-2">
            <span className="text-sm" dangerouslySetInnerHTML={{ __html: lang.flag }} />
            <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{lang.text}</span>
          </div>
        </motion.div>
      ))}
    </div>
  )
}

// 3. Réponses Instantanées
function IllustrationFastResponse() {
  return (
    <div className="relative w-full h-80 flex items-center justify-center overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-yellow-50 to-orange-100 dark:from-yellow-950/30 dark:to-orange-900/20 rounded-2xl" />

      <motion.div {...floatSlow} className="w-64">
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
            <motion.div
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.5 }}
              className="flex justify-start"
            >
              <div className="bg-gray-100 dark:bg-gray-700 rounded-xl px-3 py-1.5 max-w-[80%]">
                <p className="text-xs text-gray-800 dark:text-gray-200">Nous sommes ouverts du lundi au vendredi, 9h-18h !</p>
              </div>
            </motion.div>
            {/* Typing speed indicator */}
            <motion.div {...pulse} className="flex items-center gap-1.5 ml-1">
              <svg className="w-3 h-3 text-yellow-500" fill="currentColor" viewBox="0 0 24 24">
                <path d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <span className="text-[10px] text-yellow-600 dark:text-yellow-400 font-semibold">&lt; 2s</span>
            </motion.div>
          </div>
        </div>
      </motion.div>
    </div>
  )
}

// 4. Base de Connaissances
function IllustrationKnowledgeBase() {
  return (
    <div className="relative w-full h-80 flex items-center justify-center overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-purple-50 to-violet-100 dark:from-purple-950/30 dark:to-violet-900/20 rounded-2xl" />

      <motion.div {...float} className="relative">
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
            <motion.div {...pulse} className="absolute -bottom-3 -right-3 w-10 h-10 bg-purple-500 rounded-full shadow-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </motion.div>
          </div>
        </div>
      </motion.div>

      {/* File type badges */}
      <motion.div
        animate={{ y: [0, -5, 0] }}
        transition={{ duration: 2, repeat: Infinity, delay: 0.3 }}
        className="absolute top-8 right-10 bg-white dark:bg-gray-800 rounded-lg shadow-md px-2 py-1.5 text-[10px] font-bold text-red-500"
      >
        PDF
      </motion.div>
      <motion.div
        animate={{ y: [0, -5, 0] }}
        transition={{ duration: 2.5, repeat: Infinity, delay: 0.8 }}
        className="absolute bottom-10 left-8 bg-white dark:bg-gray-800 rounded-lg shadow-md px-2 py-1.5 text-[10px] font-bold text-blue-500"
      >
        DOCX
      </motion.div>
      <motion.div
        animate={{ y: [0, -5, 0] }}
        transition={{ duration: 2.2, repeat: Infinity, delay: 1.2 }}
        className="absolute top-16 left-10 bg-white dark:bg-gray-800 rounded-lg shadow-md px-2 py-1.5 text-[10px] font-bold text-green-500"
      >
        CSV
      </motion.div>
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
          <motion.div
            key={i}
            animate={{ y: [0, -6, 0] }}
            transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut", delay: agent.delay }}
            className="flex flex-col items-center gap-2"
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
          </motion.div>
        ))}
      </div>

      {/* Connection lines */}
      <motion.div {...pulse} className="absolute top-8 left-1/2 -translate-x-1/2 bg-white dark:bg-gray-800 rounded-full shadow-md px-3 py-1.5 flex items-center gap-1.5">
        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
        <span className="text-[10px] font-medium text-gray-600 dark:text-gray-300">3 agents actifs</span>
      </motion.div>
    </div>
  )
}

// 6. Analytics Avancées
function IllustrationAnalytics() {
  const bars = [35, 55, 45, 70, 60, 80, 65]

  return (
    <div className="relative w-full h-80 flex items-center justify-center overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-emerald-50 to-green-100 dark:from-emerald-950/30 dark:to-green-900/20 rounded-2xl" />

      <motion.div {...floatSlow} className="w-64">
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
              <motion.div
                key={i}
                initial={{ height: 0 }}
                animate={{ height: `${h}%` }}
                transition={{ duration: 0.5, delay: i * 0.1 }}
                className="flex-1 bg-gradient-to-t from-green-500 to-emerald-400 rounded-t"
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
      </motion.div>

      {/* Floating metric */}
      <motion.div
        animate={{ y: [0, -8, 0] }}
        transition={{ duration: 2.5, repeat: Infinity, delay: 0.5 }}
        className="absolute top-6 right-8 bg-white dark:bg-gray-800 rounded-lg shadow-md px-3 py-2"
      >
        <span className="text-green-500 text-xs font-bold">+24%</span>
        <span className="text-[10px] text-gray-500 ml-1">&#8593;</span>
      </motion.div>
    </div>
  )
}

// 7. Sécurité & Confidentialité
function IllustrationSecurity() {
  return (
    <div className="relative w-full h-80 flex items-center justify-center overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-slate-50 to-gray-100 dark:from-slate-950/30 dark:to-gray-900/30 rounded-2xl" />

      <motion.div {...float} className="relative">
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
      </motion.div>

      {/* Encryption dots */}
      {[
        { x: "left-8", y: "top-12" },
        { x: "right-10", y: "top-16" },
        { x: "left-12", y: "bottom-14" },
        { x: "right-6", y: "bottom-10" },
      ].map((pos, i) => (
        <motion.div
          key={i}
          animate={{ opacity: [0.3, 0.8, 0.3] }}
          transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.3 }}
          className={`absolute ${pos.x} ${pos.y} text-[10px] font-mono text-gray-400 dark:text-gray-500`}
        >
          {["AES-256", "E2E", "SHA-512", "TLS 1.3"][i]}
        </motion.div>
      ))}
    </div>
  )
}

// 8. IA Personnalisable
function IllustrationCustomAI() {
  return (
    <div className="relative w-full h-80 flex items-center justify-center overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-amber-50 to-yellow-100 dark:from-amber-950/30 dark:to-yellow-900/20 rounded-2xl" />

      <motion.div {...floatSlow} className="w-60">
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
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${slider.value}%` }}
                  transition={{ duration: 0.8, delay: i * 0.2 }}
                  className={`h-full ${slider.color} rounded-full`}
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
      </motion.div>
    </div>
  )
}

// 9. Intégration WhatsApp
function IllustrationWhatsApp() {
  return (
    <div className="relative w-full h-80 flex items-center justify-center overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-green-50 to-emerald-100 dark:from-green-950/30 dark:to-emerald-900/20 rounded-2xl" />

      <motion.div {...float} className="w-56">
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
      </motion.div>

      {/* API connection badge */}
      <motion.div
        animate={{ y: [0, -5, 0] }}
        transition={{ duration: 2, repeat: Infinity }}
        className="absolute top-6 right-6 bg-white dark:bg-gray-800 rounded-lg shadow-md px-2.5 py-1.5 flex items-center gap-1.5"
      >
        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
        <span className="text-[10px] font-medium text-gray-600 dark:text-gray-300">API connectée</span>
      </motion.div>
    </div>
  )
}

// Export map by feature index
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
]

export default featureIllustrations
