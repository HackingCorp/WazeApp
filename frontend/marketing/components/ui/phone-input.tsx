"use client"

import { useState, useRef, useEffect } from "react"
import { ChevronDown, Search, Phone } from "lucide-react"

interface Country {
  name: string
  code: string
  dialCode: string
  flag: string
}

interface PhoneInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  error?: string
}

const countries: Country[] = [
  // Europe
  { name: "France", code: "FR", dialCode: "+33", flag: "🇫🇷" },
  { name: "Germany", code: "DE", dialCode: "+49", flag: "🇩🇪" },
  { name: "United Kingdom", code: "GB", dialCode: "+44", flag: "🇬🇧" },
  { name: "Spain", code: "ES", dialCode: "+34", flag: "🇪🇸" },
  { name: "Italy", code: "IT", dialCode: "+39", flag: "🇮🇹" },
  { name: "Netherlands", code: "NL", dialCode: "+31", flag: "🇳🇱" },
  { name: "Belgium", code: "BE", dialCode: "+32", flag: "🇧🇪" },
  { name: "Switzerland", code: "CH", dialCode: "+41", flag: "🇨🇭" },
  { name: "Austria", code: "AT", dialCode: "+43", flag: "🇦🇹" },
  { name: "Portugal", code: "PT", dialCode: "+351", flag: "🇵🇹" },
  { name: "Sweden", code: "SE", dialCode: "+46", flag: "🇸🇪" },
  { name: "Norway", code: "NO", dialCode: "+47", flag: "🇳🇴" },
  { name: "Denmark", code: "DK", dialCode: "+45", flag: "🇩🇰" },
  { name: "Finland", code: "FI", dialCode: "+358", flag: "🇫🇮" },
  { name: "Poland", code: "PL", dialCode: "+48", flag: "🇵🇱" },
  { name: "Czech Republic", code: "CZ", dialCode: "+420", flag: "🇨🇿" },
  { name: "Hungary", code: "HU", dialCode: "+36", flag: "🇭🇺" },
  { name: "Romania", code: "RO", dialCode: "+40", flag: "🇷🇴" },
  { name: "Bulgaria", code: "BG", dialCode: "+359", flag: "🇧🇬" },
  { name: "Croatia", code: "HR", dialCode: "+385", flag: "🇭🇷" },
  { name: "Serbia", code: "RS", dialCode: "+381", flag: "🇷🇸" },
  { name: "Greece", code: "GR", dialCode: "+30", flag: "🇬🇷" },
  { name: "Ukraine", code: "UA", dialCode: "+380", flag: "🇺🇦" },
  { name: "Russia", code: "RU", dialCode: "+7", flag: "🇷🇺" },
  
  // North America
  { name: "United States", code: "US", dialCode: "+1", flag: "🇺🇸" },
  { name: "Canada", code: "CA", dialCode: "+1", flag: "🇨🇦" },
  { name: "Mexico", code: "MX", dialCode: "+52", flag: "🇲🇽" },
  
  // Africa
  { name: "Algeria", code: "DZ", dialCode: "+213", flag: "🇩🇿" },
  { name: "Morocco", code: "MA", dialCode: "+212", flag: "🇲🇦" },
  { name: "Tunisia", code: "TN", dialCode: "+216", flag: "🇹🇳" },
  { name: "Egypt", code: "EG", dialCode: "+20", flag: "🇪🇬" },
  { name: "Libya", code: "LY", dialCode: "+218", flag: "🇱🇾" },
  { name: "Sudan", code: "SD", dialCode: "+249", flag: "🇸🇩" },
  { name: "South Africa", code: "ZA", dialCode: "+27", flag: "🇿🇦" },
  { name: "Nigeria", code: "NG", dialCode: "+234", flag: "🇳🇬" },
  { name: "Ghana", code: "GH", dialCode: "+233", flag: "🇬🇭" },
  { name: "Kenya", code: "KE", dialCode: "+254", flag: "🇰🇪" },
  { name: "Ethiopia", code: "ET", dialCode: "+251", flag: "🇪🇹" },
  { name: "Tanzania", code: "TZ", dialCode: "+255", flag: "🇹🇿" },
  { name: "Uganda", code: "UG", dialCode: "+256", flag: "🇺🇬" },
  { name: "Senegal", code: "SN", dialCode: "+221", flag: "🇸🇳" },
  { name: "Ivory Coast", code: "CI", dialCode: "+225", flag: "🇨🇮" },
  { name: "Mali", code: "ML", dialCode: "+223", flag: "🇲🇱" },
  { name: "Burkina Faso", code: "BF", dialCode: "+226", flag: "🇧🇫" },
  { name: "Niger", code: "NE", dialCode: "+227", flag: "🇳🇪" },
  { name: "Chad", code: "TD", dialCode: "+235", flag: "🇹🇩" },
  { name: "Cameroon", code: "CM", dialCode: "+237", flag: "🇨🇲" },
  { name: "Central African Republic", code: "CF", dialCode: "+236", flag: "🇨🇫" },
  { name: "Gabon", code: "GA", dialCode: "+241", flag: "🇬🇦" },
  { name: "Congo", code: "CG", dialCode: "+242", flag: "🇨🇬" },
  { name: "Democratic Republic of Congo", code: "CD", dialCode: "+243", flag: "🇨🇩" },
  { name: "Rwanda", code: "RW", dialCode: "+250", flag: "🇷🇼" },
  { name: "Burundi", code: "BI", dialCode: "+257", flag: "🇧🇮" },
  { name: "Madagascar", code: "MG", dialCode: "+261", flag: "🇲🇬" },
  { name: "Mauritius", code: "MU", dialCode: "+230", flag: "🇲🇺" },
  { name: "Comoros", code: "KM", dialCode: "+269", flag: "🇰🇲" },
  { name: "Seychelles", code: "SC", dialCode: "+248", flag: "🇸🇨" },
  
  // Middle East
  { name: "Saudi Arabia", code: "SA", dialCode: "+966", flag: "🇸🇦" },
  { name: "United Arab Emirates", code: "AE", dialCode: "+971", flag: "🇦🇪" },
  { name: "Qatar", code: "QA", dialCode: "+974", flag: "🇶🇦" },
  { name: "Kuwait", code: "KW", dialCode: "+965", flag: "🇰🇼" },
  { name: "Bahrain", code: "BH", dialCode: "+973", flag: "🇧🇭" },
  { name: "Oman", code: "OM", dialCode: "+968", flag: "🇴🇲" },
  { name: "Yemen", code: "YE", dialCode: "+967", flag: "🇾🇪" },
  { name: "Iraq", code: "IQ", dialCode: "+964", flag: "🇮🇶" },
  { name: "Iran", code: "IR", dialCode: "+98", flag: "🇮🇷" },
  { name: "Afghanistan", code: "AF", dialCode: "+93", flag: "🇦🇫" },
  { name: "Pakistan", code: "PK", dialCode: "+92", flag: "🇵🇰" },
  { name: "Turkey", code: "TR", dialCode: "+90", flag: "🇹🇷" },
  { name: "Israel", code: "IL", dialCode: "+972", flag: "🇮🇱" },
  { name: "Palestine", code: "PS", dialCode: "+970", flag: "🇵🇸" },
  { name: "Lebanon", code: "LB", dialCode: "+961", flag: "🇱🇧" },
  { name: "Syria", code: "SY", dialCode: "+963", flag: "🇸🇾" },
  { name: "Jordan", code: "JO", dialCode: "+962", flag: "🇯🇴" },
  
  // Asia
  { name: "China", code: "CN", dialCode: "+86", flag: "🇨🇳" },
  { name: "Japan", code: "JP", dialCode: "+81", flag: "🇯🇵" },
  { name: "South Korea", code: "KR", dialCode: "+82", flag: "🇰🇷" },
  { name: "India", code: "IN", dialCode: "+91", flag: "🇮🇳" },
  { name: "Indonesia", code: "ID", dialCode: "+62", flag: "🇮🇩" },
  { name: "Thailand", code: "TH", dialCode: "+66", flag: "🇹🇭" },
  { name: "Vietnam", code: "VN", dialCode: "+84", flag: "🇻🇳" },
  { name: "Philippines", code: "PH", dialCode: "+63", flag: "🇵🇭" },
  { name: "Malaysia", code: "MY", dialCode: "+60", flag: "🇲🇾" },
  { name: "Singapore", code: "SG", dialCode: "+65", flag: "🇸🇬" },
  { name: "Bangladesh", code: "BD", dialCode: "+880", flag: "🇧🇩" },
  { name: "Sri Lanka", code: "LK", dialCode: "+94", flag: "🇱🇰" },
  { name: "Myanmar", code: "MM", dialCode: "+95", flag: "🇲🇲" },
  { name: "Cambodia", code: "KH", dialCode: "+855", flag: "🇰🇭" },
  { name: "Laos", code: "LA", dialCode: "+856", flag: "🇱🇦" },
  { name: "Nepal", code: "NP", dialCode: "+977", flag: "🇳🇵" },
  { name: "Bhutan", code: "BT", dialCode: "+975", flag: "🇧🇹" },
  { name: "Maldives", code: "MV", dialCode: "+960", flag: "🇲🇻" },
  
  // South America
  { name: "Brazil", code: "BR", dialCode: "+55", flag: "🇧🇷" },
  { name: "Argentina", code: "AR", dialCode: "+54", flag: "🇦🇷" },
  { name: "Chile", code: "CL", dialCode: "+56", flag: "🇨🇱" },
  { name: "Peru", code: "PE", dialCode: "+51", flag: "🇵🇪" },
  { name: "Colombia", code: "CO", dialCode: "+57", flag: "🇨🇴" },
  { name: "Venezuela", code: "VE", dialCode: "+58", flag: "🇻🇪" },
  { name: "Ecuador", code: "EC", dialCode: "+593", flag: "🇪🇨" },
  { name: "Bolivia", code: "BO", dialCode: "+591", flag: "🇧🇴" },
  { name: "Paraguay", code: "PY", dialCode: "+595", flag: "🇵🇾" },
  { name: "Uruguay", code: "UY", dialCode: "+598", flag: "🇺🇾" },
  { name: "Guyana", code: "GY", dialCode: "+592", flag: "🇬🇾" },
  { name: "Suriname", code: "SR", dialCode: "+597", flag: "🇸🇷" },
  
  // Oceania
  { name: "Australia", code: "AU", dialCode: "+61", flag: "🇦🇺" },
  { name: "New Zealand", code: "NZ", dialCode: "+64", flag: "🇳🇿" },
  { name: "Papua New Guinea", code: "PG", dialCode: "+675", flag: "🇵🇬" },
  { name: "Fiji", code: "FJ", dialCode: "+679", flag: "🇫🇯" },
  
  // Central America & Caribbean
  { name: "Guatemala", code: "GT", dialCode: "+502", flag: "🇬🇹" },
  { name: "Honduras", code: "HN", dialCode: "+504", flag: "🇭🇳" },
  { name: "El Salvador", code: "SV", dialCode: "+503", flag: "🇸🇻" },
  { name: "Nicaragua", code: "NI", dialCode: "+505", flag: "🇳🇮" },
  { name: "Costa Rica", code: "CR", dialCode: "+506", flag: "🇨🇷" },
  { name: "Panama", code: "PA", dialCode: "+507", flag: "🇵🇦" },
  { name: "Jamaica", code: "JM", dialCode: "+1876", flag: "🇯🇲" },
  { name: "Cuba", code: "CU", dialCode: "+53", flag: "🇨🇺" },
  { name: "Dominican Republic", code: "DO", dialCode: "+1809", flag: "🇩🇴" },
  { name: "Haiti", code: "HT", dialCode: "+509", flag: "🇭🇹" },
  { name: "Puerto Rico", code: "PR", dialCode: "+1787", flag: "🇵🇷" },
  { name: "Trinidad and Tobago", code: "TT", dialCode: "+1868", flag: "🇹🇹" },
  { name: "Barbados", code: "BB", dialCode: "+1246", flag: "🇧🇧" },
]

export function PhoneInput({ value, onChange, placeholder = "6 12 34 56 78", className = "", error }: PhoneInputProps) {
  const [selectedCountry, setSelectedCountry] = useState<Country>(countries[0]) // Default to France
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [phoneNumber, setPhoneNumber] = useState("")
  const dropdownRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Parse existing value to extract country and phone number
  useEffect(() => {
    if (value && value.startsWith("+")) {
      const country = countries.find(c => value.startsWith(c.dialCode))
      if (country) {
        setSelectedCountry(country)
        setPhoneNumber(value.substring(country.dialCode.length).trim())
      }
    } else {
      setPhoneNumber(value)
    }
  }, [value])

  // Update parent component when country or phone number changes
  useEffect(() => {
    const fullNumber = phoneNumber ? `${selectedCountry.dialCode} ${phoneNumber}` : ""
    onChange(fullNumber)
  }, [selectedCountry, phoneNumber])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
        setSearchQuery("")
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const filteredCountries = countries.filter(country =>
    country.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    country.dialCode.includes(searchQuery) ||
    country.code.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const handleCountrySelect = (country: Country) => {
    setSelectedCountry(country)
    setIsOpen(false)
    setSearchQuery("")
    inputRef.current?.focus()
  }

  const formatPhoneNumber = (value: string) => {
    // Remove all non-digits
    const digits = value.replace(/\D/g, "")
    
    // Format based on country
    if (selectedCountry.code === "FR") {
      // French format: 6 12 34 56 78
      return digits.replace(/(\d{1})(\d{2})(\d{2})(\d{2})(\d{2})/, "$1 $2 $3 $4 $5").trim()
    } else if (selectedCountry.code === "US" || selectedCountry.code === "CA") {
      // US/Canada format: (555) 123-4567
      return digits.replace(/(\d{3})(\d{3})(\d{4})/, "($1) $2-$3").trim()
    } else if (selectedCountry.code === "GB") {
      // UK format: 20 1234 5678
      return digits.replace(/(\d{2})(\d{4})(\d{4})/, "$1 $2 $3").trim()
    } else if (selectedCountry.code === "DE") {
      // German format: 30 12345678
      return digits.replace(/(\d{2})(\d{8})/, "$1 $2").trim()
    } else {
      // Default: add spaces every 2-3 digits
      return digits.replace(/(\d{2,3})(?=\d)/g, "$1 ").trim()
    }
  }

  const handlePhoneNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    const formatted = formatPhoneNumber(value)
    setPhoneNumber(formatted)
  }

  return (
    <div className={`relative ${className}`}>
      <div className="flex">
        {/* Country Selector */}
        <div className="relative" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className={`flex items-center px-3 py-2 border border-r-0 rounded-l-lg focus:ring-2 focus:ring-primary focus:border-transparent dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 min-w-[100px] ${
              error ? 'border-red-300 dark:border-red-600' : 'border-gray-300 dark:border-gray-600'
            }`}
          >
            <span className="text-lg mr-2">{selectedCountry.flag}</span>
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300 mr-1">
              {selectedCountry.dialCode}
            </span>
            <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          </button>

          {/* Dropdown */}
          {isOpen && (
            <div className="absolute top-full left-0 z-50 w-80 mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-xl max-h-80 overflow-hidden">
              {/* Search */}
              <div className="p-3 border-b border-gray-200 dark:border-gray-600">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search country..."
                    className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-primary focus:border-transparent dark:bg-gray-700 dark:text-white"
                  />
                </div>
              </div>

              {/* Countries List */}
              <div className="overflow-y-auto max-h-60">
                {filteredCountries.map((country) => (
                  <button
                    key={country.code}
                    type="button"
                    onClick={() => handleCountrySelect(country)}
                    className="w-full flex items-center px-4 py-3 text-left hover:bg-gray-100 dark:hover:bg-gray-700 focus:bg-gray-100 dark:focus:bg-gray-700 transition-colors"
                  >
                    <span className="text-lg mr-3 flex-shrink-0">{country.flag}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                        {country.name}
                      </div>
                    </div>
                    <div className="text-sm text-gray-500 dark:text-gray-400 ml-2 flex-shrink-0">
                      {country.dialCode}
                    </div>
                  </button>
                ))}
                {filteredCountries.length === 0 && (
                  <div className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 text-center">
                    No countries found
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Phone Number Input */}
        <div className="relative flex-1">
          <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
          <input
            ref={inputRef}
            type="tel"
            value={phoneNumber}
            onChange={handlePhoneNumberChange}
            className={`w-full pl-10 pr-4 py-2 border rounded-r-lg focus:ring-2 focus:ring-primary focus:border-transparent dark:bg-gray-700 dark:text-white ${
              error ? 'border-red-300 dark:border-red-600' : 'border-gray-300 dark:border-gray-600'
            }`}
            placeholder={placeholder}
          />
        </div>
      </div>
      
      {/* Helper text or error */}
      {error ? (
        <div className="mt-1 text-xs text-red-600 dark:text-red-400">
          {error}
        </div>
      ) : (
        <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          Format: {selectedCountry.dialCode} {placeholder}
        </div>
      )}
    </div>
  )
}