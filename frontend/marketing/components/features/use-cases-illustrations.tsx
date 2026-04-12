"use client"

import { motion } from "framer-motion"

const float = {
  animate: {
    y: [0, -8, 0],
    transition: { duration: 3, repeat: Infinity, ease: "easeInOut" },
  },
}

// E-commerce
function IllustrationEcommerce() {
  return (
    <div className="relative w-full h-80 flex items-center justify-center overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-orange-50 to-amber-100 dark:from-orange-950/30 dark:to-amber-900/20 rounded-2xl" />

      <motion.div {...float} className="w-56">
        {/* WhatsApp chat with order */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl overflow-hidden">
          <div className="bg-[#075E54] px-3 py-2 flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-orange-400 flex items-center justify-center">
              <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
              </svg>
            </div>
            <span className="text-white text-[10px] font-semibold">ShopBot</span>
          </div>

          <div className="bg-[#ECE5DD] dark:bg-gray-700 p-2 space-y-1.5">
            {/* User message */}
            <div className="flex justify-start">
              <div className="bg-white dark:bg-gray-600 rounded-lg px-2 py-1 max-w-[80%] shadow-sm">
                <p className="text-[9px] text-gray-800 dark:text-gray-200">Ma commande #4521 ?</p>
              </div>
            </div>
            {/* Bot response - order card */}
            <div className="flex justify-end">
              <div className="bg-[#DCF8C6] dark:bg-green-800 rounded-lg px-2 py-1.5 max-w-[85%] shadow-sm">
                <p className="text-[9px] font-semibold text-gray-800 dark:text-gray-200 mb-1">Commande #4521</p>
                <div className="bg-white/50 dark:bg-black/10 rounded px-1.5 py-1 space-y-0.5">
                  <div className="flex justify-between text-[8px]">
                    <span className="text-gray-600 dark:text-gray-300">Statut</span>
                    <span className="text-green-600 font-semibold">En livraison</span>
                  </div>
                  <div className="flex justify-between text-[8px]">
                    <span className="text-gray-600 dark:text-gray-300">ETA</span>
                    <span className="text-gray-800 dark:text-gray-200 font-medium">14h30</span>
                  </div>
                </div>
                {/* Progress bar */}
                <div className="mt-1.5 flex items-center gap-0.5">
                  <div className="flex-1 h-1 bg-green-500 rounded-full" />
                  <div className="flex-1 h-1 bg-green-500 rounded-full" />
                  <div className="flex-1 h-1 bg-green-500 rounded-full" />
                  <div className="flex-1 h-1 bg-gray-300 dark:bg-gray-500 rounded-full" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Floating badges */}
      <motion.div
        animate={{ y: [0, -6, 0] }}
        transition={{ duration: 2.5, repeat: Infinity }}
        className="absolute top-6 left-6 bg-white dark:bg-gray-800 rounded-lg shadow-md px-2.5 py-1.5 flex items-center gap-1.5"
      >
        <span className="text-sm">&#128230;</span>
        <span className="text-[10px] font-medium text-gray-600 dark:text-gray-300">142 commandes</span>
      </motion.div>

      <motion.div
        animate={{ y: [0, -5, 0] }}
        transition={{ duration: 2, repeat: Infinity, delay: 0.8 }}
        className="absolute bottom-8 right-6 bg-green-500 rounded-lg shadow-md px-2.5 py-1.5"
      >
        <span className="text-[10px] font-bold text-white">+32% ventes</span>
      </motion.div>
    </div>
  )
}

// Real Estate
function IllustrationRealEstate() {
  return (
    <div className="relative w-full h-80 flex items-center justify-center overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-blue-50 to-sky-100 dark:from-blue-950/30 dark:to-sky-900/20 rounded-2xl" />

      <motion.div {...float} className="w-56">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl overflow-hidden">
          <div className="bg-[#075E54] px-3 py-2 flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-blue-400 flex items-center justify-center">
              <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
            </div>
            <span className="text-white text-[10px] font-semibold">ImmoBot</span>
          </div>

          <div className="bg-[#ECE5DD] dark:bg-gray-700 p-2 space-y-1.5">
            <div className="flex justify-start">
              <div className="bg-white dark:bg-gray-600 rounded-lg px-2 py-1 shadow-sm">
                <p className="text-[9px] text-gray-800 dark:text-gray-200">Appartement 3 pièces Douala ?</p>
              </div>
            </div>
            {/* Property card */}
            <div className="flex justify-end">
              <div className="bg-[#DCF8C6] dark:bg-green-800 rounded-lg overflow-hidden max-w-[85%] shadow-sm">
                {/* Mini property image placeholder */}
                <div className="bg-gradient-to-br from-blue-200 to-sky-300 dark:from-blue-700 dark:to-sky-600 h-16 flex items-center justify-center">
                  <svg className="w-8 h-8 text-white/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                </div>
                <div className="px-2 py-1.5">
                  <p className="text-[9px] font-semibold text-gray-800 dark:text-gray-200">Villa Bonamoussadi</p>
                  <p className="text-[8px] text-gray-600 dark:text-gray-300">3 pièces &bull; 85m² &bull; Parking</p>
                  <p className="text-[9px] font-bold text-green-700 dark:text-green-400 mt-0.5">180 000 FCFA/mois</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Calendar badge */}
      <motion.div
        animate={{ y: [0, -6, 0] }}
        transition={{ duration: 2.5, repeat: Infinity, delay: 0.3 }}
        className="absolute top-8 right-8 bg-white dark:bg-gray-800 rounded-lg shadow-md px-2.5 py-1.5"
      >
        <div className="flex items-center gap-1.5">
          <svg className="w-3 h-3 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" strokeWidth={2} />
            <line x1="16" y1="2" x2="16" y2="6" strokeWidth={2} />
            <line x1="8" y1="2" x2="8" y2="6" strokeWidth={2} />
            <line x1="3" y1="10" x2="21" y2="10" strokeWidth={2} />
          </svg>
          <span className="text-[10px] font-medium text-gray-600 dark:text-gray-300">Visite 14h</span>
        </div>
      </motion.div>
    </div>
  )
}

// Restaurants
function IllustrationRestaurant() {
  return (
    <div className="relative w-full h-80 flex items-center justify-center overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-red-50 to-rose-100 dark:from-red-950/30 dark:to-rose-900/20 rounded-2xl" />

      <motion.div {...float} className="w-56">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl overflow-hidden">
          <div className="bg-[#075E54] px-3 py-2 flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-red-400 flex items-center justify-center">
              <span className="text-[10px]">&#127860;</span>
            </div>
            <span className="text-white text-[10px] font-semibold">RestoBot</span>
          </div>

          <div className="bg-[#ECE5DD] dark:bg-gray-700 p-2 space-y-1.5">
            <div className="flex justify-start">
              <div className="bg-white dark:bg-gray-600 rounded-lg px-2 py-1 shadow-sm">
                <p className="text-[9px] text-gray-800 dark:text-gray-200">Menu du jour ?</p>
              </div>
            </div>
            {/* Menu card */}
            <div className="flex justify-end">
              <div className="bg-[#DCF8C6] dark:bg-green-800 rounded-lg px-2 py-1.5 max-w-[90%] shadow-sm">
                <p className="text-[9px] font-semibold text-gray-800 dark:text-gray-200 mb-1">&#127860; Menu du jour</p>
                <div className="space-y-1">
                  {[
                    { item: "Poulet DG", price: "3 500" },
                    { item: "Ndolè", price: "3 000" },
                    { item: "Poisson braisé", price: "4 000" },
                  ].map((dish, i) => (
                    <div key={i} className="flex justify-between items-center text-[8px]">
                      <span className="text-gray-700 dark:text-gray-300">{dish.item}</span>
                      <span className="font-semibold text-gray-800 dark:text-gray-200">{dish.price} F</span>
                    </div>
                  ))}
                </div>
                <div className="mt-1.5 bg-white/50 dark:bg-black/10 rounded px-1.5 py-0.5 text-center">
                  <span className="text-[8px] text-green-700 dark:text-green-400 font-medium">Tapez un numéro pour commander</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Order counter */}
      <motion.div
        animate={{ y: [0, -5, 0] }}
        transition={{ duration: 2, repeat: Infinity }}
        className="absolute top-6 left-6 bg-white dark:bg-gray-800 rounded-lg shadow-md px-2.5 py-1.5 flex items-center gap-1.5"
      >
        <span className="text-sm">&#128203;</span>
        <span className="text-[10px] font-medium text-gray-600 dark:text-gray-300">38 commandes</span>
      </motion.div>

      {/* Rating */}
      <motion.div
        animate={{ y: [0, -6, 0] }}
        transition={{ duration: 2.5, repeat: Infinity, delay: 0.5 }}
        className="absolute bottom-8 right-6 bg-white dark:bg-gray-800 rounded-lg shadow-md px-2.5 py-1.5 flex items-center gap-1"
      >
        <span className="text-[10px]">&#11088;</span>
        <span className="text-xs font-bold text-gray-700 dark:text-gray-300">4.8</span>
        <span className="text-[9px] text-gray-400">/5</span>
      </motion.div>
    </div>
  )
}

const useCasesIllustrations = [
  IllustrationEcommerce,
  IllustrationRealEstate,
  IllustrationRestaurant,
]

export default useCasesIllustrations
