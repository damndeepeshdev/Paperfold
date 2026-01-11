import { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { invoke } from '@tauri-apps/api/core';
import { ChevronDown, ArrowRight, Loader2, Search } from 'lucide-react';

interface AuthProps {
    onLogin: () => void;
}

const COUNTRIES = [
    { code: '+93', label: 'Afghanistan', flag: '🇦🇫' },
    { code: '+355', label: 'Albania', flag: '🇦🇱' },
    { code: '+213', label: 'Algeria', flag: '🇩🇿' },
    { code: '+1684', label: 'American Samoa', flag: '🇦🇸' },
    { code: '+376', label: 'Andorra', flag: '🇦🇩' },
    { code: '+244', label: 'Angola', flag: '🇦🇴' },
    { code: '+1264', label: 'Anguilla', flag: '🇦🇮' },
    { code: '+672', label: 'Antarctica', flag: '🇦🇶' },
    { code: '+1268', label: 'Antigua and Barbuda', flag: '🇦🇬' },
    { code: '+54', label: 'Argentina', flag: '🇦🇷' },
    { code: '+374', label: 'Armenia', flag: '🇦🇲' },
    { code: '+297', label: 'Aruba', flag: '🇦🇼' },
    { code: '+61', label: 'Australia', flag: '🇦🇺' },
    { code: '+43', label: 'Austria', flag: '🇦🇹' },
    { code: '+994', label: 'Azerbaijan', flag: '🇦🇿' },
    { code: '+1242', label: 'Bahamas', flag: '🇧🇸' },
    { code: '+973', label: 'Bahrain', flag: '🇧🇭' },
    { code: '+880', label: 'Bangladesh', flag: '🇧🇩' },
    { code: '+1246', label: 'Barbados', flag: '🇧🇧' },
    { code: '+375', label: 'Belarus', flag: '🇧🇾' },
    { code: '+32', label: 'Belgium', flag: '🇧🇪' },
    { code: '+501', label: 'Belize', flag: '🇧🇿' },
    { code: '+229', label: 'Benin', flag: '🇧🇯' },
    { code: '+1441', label: 'Bermuda', flag: '🇧🇲' },
    { code: '+975', label: 'Bhutan', flag: '🇧🇹' },
    { code: '+591', label: 'Bolivia', flag: '🇧🇴' },
    { code: '+387', label: 'Bosnia and Herzegovina', flag: '🇧🇦' },
    { code: '+267', label: 'Botswana', flag: '🇧🇼' },
    { code: '+55', label: 'Brazil', flag: '🇧🇷' },
    { code: '+246', label: 'British Indian Ocean Territory', flag: '🇮🇴' },
    { code: '+673', label: 'Brunei', flag: '🇧🇳' },
    { code: '+359', label: 'Bulgaria', flag: '🇧🇬' },
    { code: '+226', label: 'Burkina Faso', flag: '🇧🇫' },
    { code: '+257', label: 'Burundi', flag: '🇧🇮' },
    { code: '+855', label: 'Cambodia', flag: '🇰🇭' },
    { code: '+237', label: 'Cameroon', flag: '🇨🇲' },
    { code: '+1', label: 'Canada', flag: '🇨🇦' },
    { code: '+238', label: 'Cape Verde', flag: '🇨🇻' },
    { code: '+1345', label: 'Cayman Islands', flag: '🇰🇾' },
    { code: '+236', label: 'Central African Republic', flag: '🇨🇫' },
    { code: '+235', label: 'Chad', flag: '🇹🇩' },
    { code: '+56', label: 'Chile', flag: '🇨🇱' },
    { code: '+86', label: 'China', flag: '🇨🇳' },
    { code: '+61', label: 'Christmas Island', flag: '🇨🇽' },
    { code: '+61', label: 'Cocos (Keeling) Islands', flag: '🇨🇨' },
    { code: '+57', label: 'Colombia', flag: '🇨🇴' },
    { code: '+269', label: 'Comoros', flag: '🇰🇲' },
    { code: '+242', label: 'Congo', flag: '🇨🇬' },
    { code: '+243', label: 'Congo, DRC', flag: '🇨🇩' },
    { code: '+682', label: 'Cook Islands', flag: '🇨🇰' },
    { code: '+506', label: 'Costa Rica', flag: '🇨🇷' },
    { code: '+225', label: 'Côte d\'Ivoire', flag: '🇨🇮' },
    { code: '+385', label: 'Croatia', flag: '🇭🇷' },
    { code: '+53', label: 'Cuba', flag: '🇨🇺' },
    { code: '+357', label: 'Cyprus', flag: '🇨🇾' },
    { code: '+420', label: 'Czech Republic', flag: '🇨🇿' },
    { code: '+45', label: 'Denmark', flag: '🇩🇰' },
    { code: '+253', label: 'Djibouti', flag: '🇩🇯' },
    { code: '+1767', label: 'Dominica', flag: '🇩🇲' },
    { code: '+1', label: 'Dominican Republic', flag: '🇩🇴' },
    { code: '+593', label: 'Ecuador', flag: '🇪🇨' },
    { code: '+20', label: 'Egypt', flag: '🇪🇬' },
    { code: '+503', label: 'El Salvador', flag: '🇸🇻' },
    { code: '+240', label: 'Equatorial Guinea', flag: '🇬🇶' },
    { code: '+291', label: 'Eritrea', flag: '🇪🇷' },
    { code: '+372', label: 'Estonia', flag: '🇪🇪' },
    { code: '+251', label: 'Ethiopia', flag: '🇪🇹' },
    { code: '+500', label: 'Falkland Islands', flag: '🇫🇰' },
    { code: '+298', label: 'Faroe Islands', flag: '🇫🇴' },
    { code: '+679', label: 'Fiji', flag: '🇫🇯' },
    { code: '+358', label: 'Finland', flag: '🇫🇮' },
    { code: '+33', label: 'France', flag: '🇫🇷' },
    { code: '+594', label: 'French Guiana', flag: '🇬🇫' },
    { code: '+689', label: 'French Polynesia', flag: '🇵🇫' },
    { code: '+241', label: 'Gabon', flag: '🇬🇦' },
    { code: '+220', label: 'Gambia', flag: '🇬🇲' },
    { code: '+995', label: 'Georgia', flag: '🇬🇪' },
    { code: '+49', label: 'Germany', flag: '🇩🇪' },
    { code: '+233', label: 'Ghana', flag: '🇬🇭' },
    { code: '+350', label: 'Gibraltar', flag: '🇬🇮' },
    { code: '+30', label: 'Greece', flag: '🇬🇷' },
    { code: '+299', label: 'Greenland', flag: '🇬🇱' },
    { code: '+1473', label: 'Grenada', flag: '🇬🇩' },
    { code: '+590', label: 'Guadeloupe', flag: '🇬🇵' },
    { code: '+1671', label: 'Guam', flag: '🇬🇺' },
    { code: '+502', label: 'Guatemala', flag: '🇬🇹' },
    { code: '+44', label: 'Guernsey', flag: '🇬🇬' },
    { code: '+224', label: 'Guinea', flag: '🇬🇳' },
    { code: '+245', label: 'Guinea-Bissau', flag: '🇬🇼' },
    { code: '+592', label: 'Guyana', flag: '🇬🇾' },
    { code: '+509', label: 'Haiti', flag: '🇭🇹' },
    { code: '+504', label: 'Honduras', flag: '🇭🇳' },
    { code: '+852', label: 'Hong Kong', flag: '🇭🇰' },
    { code: '+36', label: 'Hungary', flag: '🇭🇺' },
    { code: '+354', label: 'Iceland', flag: '🇮🇸' },
    { code: '+91', label: 'India', flag: '🇮🇳' },
    { code: '+62', label: 'Indonesia', flag: '🇮🇩' },
    { code: '+98', label: 'Iran', flag: '🇮🇷' },
    { code: '+964', label: 'Iraq', flag: '🇮🇶' },
    { code: '+353', label: 'Ireland', flag: '🇮🇪' },
    { code: '+44', label: 'Isle of Man', flag: '🇮🇲' },
    { code: '+972', label: 'Israel', flag: '🇮🇱' },
    { code: '+39', label: 'Italy', flag: '🇮🇹' },
    { code: '+1876', label: 'Jamaica', flag: '🇯🇲' },
    { code: '+81', label: 'Japan', flag: '🇯🇵' },
    { code: '+44', label: 'Jersey', flag: '🇯🇪' },
    { code: '+962', label: 'Jordan', flag: '🇯🇴' },
    { code: '+7', label: 'Kazakhstan', flag: '🇰🇿' },
    { code: '+254', label: 'Kenya', flag: '🇰🇪' },
    { code: '+686', label: 'Kiribati', flag: '🇰🇮' },
    { code: '+965', label: 'Kuwait', flag: '🇰🇼' },
    { code: '+996', label: 'Kyrgyzstan', flag: '🇰🇬' },
    { code: '+856', label: 'Laos', flag: '🇱🇦' },
    { code: '+371', label: 'Latvia', flag: '🇱🇻' },
    { code: '+961', label: 'Lebanon', flag: '🇱🇧' },
    { code: '+266', label: 'Lesotho', flag: '🇱🇸' },
    { code: '+231', label: 'Liberia', flag: '🇱🇷' },
    { code: '+218', label: 'Libya', flag: '🇱🇾' },
    { code: '+423', label: 'Liechtenstein', flag: '🇱🇮' },
    { code: '+370', label: 'Lithuania', flag: '🇱🇹' },
    { code: '+352', label: 'Luxembourg', flag: '🇱🇺' },
    { code: '+853', label: 'Macau', flag: '🇲🇴' },
    { code: '+389', label: 'Macedonia', flag: '🇲🇰' },
    { code: '+261', label: 'Madagascar', flag: '🇲🇬' },
    { code: '+265', label: 'Malawi', flag: '🇲🇼' },
    { code: '+60', label: 'Malaysia', flag: '🇲🇾' },
    { code: '+960', label: 'Maldives', flag: '🇲🇻' },
    { code: '+223', label: 'Mali', flag: '🇲🇱' },
    { code: '+356', label: 'Malta', flag: '🇲🇹' },
    { code: '+692', label: 'Marshall Islands', flag: '🇲🇭' },
    { code: '+596', label: 'Martinique', flag: '🇲🇶' },
    { code: '+222', label: 'Mauritania', flag: '🇲🇷' },
    { code: '+230', label: 'Mauritius', flag: '🇲🇺' },
    { code: '+262', label: 'Mayotte', flag: 'YT' },
    { code: '+52', label: 'Mexico', flag: '🇲🇽' },
    { code: '+691', label: 'Micronesia', flag: '🇫🇲' },
    { code: '+373', label: 'Moldova', flag: '🇲🇩' },
    { code: '+377', label: 'Monaco', flag: '🇲🇨' },
    { code: '+976', label: 'Mongolia', flag: '🇲🇳' },
    { code: '+382', label: 'Montenegro', flag: '🇲🇪' },
    { code: '+1664', label: 'Montserrat', flag: '🇲🇸' },
    { code: '+212', label: 'Morocco', flag: '🇲🇦' },
    { code: '+258', label: 'Mozambique', flag: '🇲🇿' },
    { code: '+95', label: 'Myanmar', flag: '🇲🇲' },
    { code: '+264', label: 'Namibia', flag: '🇳🇦' },
    { code: '+674', label: 'Nauru', flag: '🇳🇷' },
    { code: '+977', label: 'Nepal', flag: '🇳🇵' },
    { code: '+31', label: 'Netherlands', flag: '🇳🇱' },
    { code: '+687', label: 'New Caledonia', flag: '🇳🇨' },
    { code: '+64', label: 'New Zealand', flag: '🇳🇿' },
    { code: '+505', label: 'Nicaragua', flag: '🇳🇮' },
    { code: '+227', label: 'Niger', flag: '🇳🇪' },
    { code: '+234', label: 'Nigeria', flag: '🇳🇬' },
    { code: '+683', label: 'Niue', flag: '🇳🇺' },
    { code: '+672', label: 'Norfolk Island', flag: '🇳🇫' },
    { code: '+850', label: 'North Korea', flag: '🇰🇵' },
    { code: '+1670', label: 'Northern Mariana Islands', flag: '🇲🇵' },
    { code: '+47', label: 'Norway', flag: '🇳🇴' },
    { code: '+968', label: 'Oman', flag: '🇴🇲' },
    { code: '+92', label: 'Pakistan', flag: '🇵🇰' },
    { code: '+680', label: 'Palau', flag: '🇵🇼' },
    { code: '+970', label: 'Palestine', flag: '🇵🇸' },
    { code: '+507', label: 'Panama', flag: '🇵🇦' },
    { code: '+675', label: 'Papua New Guinea', flag: '🇵🇬' },
    { code: '+595', label: 'Paraguay', flag: '🇵🇾' },
    { code: '+51', label: 'Peru', flag: '🇵🇪' },
    { code: '+63', label: 'Philippines', flag: '🇵🇭' },
    { code: '+48', label: 'Poland', flag: '🇵🇱' },
    { code: '+351', label: 'Portugal', flag: '🇵🇹' },
    { code: '+1787', label: 'Puerto Rico', flag: '🇵🇷' },
    { code: '+974', label: 'Qatar', flag: '🇶🇦' },
    { code: '+262', label: 'Réunion', flag: '🇷🇪' },
    { code: '+40', label: 'Romania', flag: '🇷🇴' },
    { code: '+7', label: 'Russia', flag: '🇷🇺' },
    { code: '+250', label: 'Rwanda', flag: '🇷🇼' },
    { code: '+590', label: 'Saint Barthélemy', flag: '🇧🇱' },
    { code: '+290', label: 'Saint Helena', flag: '🇸🇭' },
    { code: '+1869', label: 'Saint Kitts and Nevis', flag: '🇰🇳' },
    { code: '+1758', label: 'Saint Lucia', flag: '🇱🇨' },
    { code: '+590', label: 'Saint Martin', flag: '🇲🇫' },
    { code: '+508', label: 'Saint Pierre and Miquelon', flag: '🇵🇲' },
    { code: '+1784', label: 'Saint Vincent and the Grenadines', flag: '🇻🇨' },
    { code: '+685', label: 'Samoa', flag: '🇼🇸' },
    { code: '+378', label: 'San Marino', flag: '🇸🇲' },
    { code: '+239', label: 'Sao Tome and Principe', flag: '🇸🇹' },
    { code: '+966', label: 'Saudi Arabia', flag: '🇸🇦' },
    { code: '+221', label: 'Senegal', flag: '🇸🇳' },
    { code: '+381', label: 'Serbia', flag: '🇷🇸' },
    { code: '+248', label: 'Seychelles', flag: '🇸🇨' },
    { code: '+232', label: 'Sierra Leone', flag: '🇸🇱' },
    { code: '+65', label: 'Singapore', flag: '🇸🇬' },
    { code: '+1721', label: 'Sint Maarten', flag: '🇸🇽' },
    { code: '+421', label: 'Slovakia', flag: '🇸🇰' },
    { code: '+386', label: 'Slovenia', flag: '🇸🇮' },
    { code: '+677', label: 'Solomon Islands', flag: '🇸🇧' },
    { code: '+252', label: 'Somalia', flag: '🇸🇴' },
    { code: '+27', label: 'South Africa', flag: '🇿🇦' },
    { code: '+82', label: 'South Korea', flag: '🇰🇷' },
    { code: '+211', label: 'South Sudan', flag: '🇸🇸' },
    { code: '+34', label: 'Spain', flag: '🇪🇸' },
    { code: '+94', label: 'Sri Lanka', flag: '🇱🇰' },
    { code: '+249', label: 'Sudan', flag: '🇸🇩' },
    { code: '+597', label: 'Suriname', flag: '🇸🇷' },
    { code: '+47', label: 'Svalbard and Jan Mayen', flag: '🇸🇯' },
    { code: '+268', label: 'Swaziland', flag: '🇸🇿' },
    { code: '+46', label: 'Sweden', flag: '🇸🇪' },
    { code: '+41', label: 'Switzerland', flag: '🇨🇭' },
    { code: '+963', label: 'Syria', flag: '🇸🇾' },
    { code: '+886', label: 'Taiwan', flag: '🇹🇼' },
    { code: '+992', label: 'Tajikistan', flag: '🇹🇯' },
    { code: '+255', label: 'Tanzania', flag: '🇹🇿' },
    { code: '+66', label: 'Thailand', flag: '🇹🇭' },
    { code: '+670', label: 'Timor-Leste', flag: '🇹🇱' },
    { code: '+228', label: 'Togo', flag: '🇹🇬' },
    { code: '+690', label: 'Tokelau', flag: '🇹🇰' },
    { code: '+676', label: 'Tonga', flag: '🇹🇴' },
    { code: '+1868', label: 'Trinidad and Tobago', flag: '🇹🇹' },
    { code: '+216', label: 'Tunisia', flag: '🇹🇳' },
    { code: '+90', label: 'Turkey', flag: '🇹🇷' },
    { code: '+993', label: 'Turkmenistan', flag: '🇹🇲' },
    { code: '+1649', label: 'Turks and Caicos Islands', flag: '🇹🇨' },
    { code: '+688', label: 'Tuvalu', flag: '🇹🇻' },
    { code: '+256', label: 'Uganda', flag: '🇺🇬' },
    { code: '+380', label: 'Ukraine', flag: '🇺🇦' },
    { code: '+971', label: 'UAE', flag: '🇦🇪' },
    { code: '+44', label: 'UK', flag: '🇬🇧' },
    { code: '+1', label: 'USA', flag: '🇺🇸' },
    { code: '+598', label: 'Uruguay', flag: '🇺🇾' },
    { code: '+998', label: 'Uzbekistan', flag: '🇺🇿' },
    { code: '+678', label: 'Vanuatu', flag: '🇻🇺' },
    { code: '+379', label: 'Vatican City', flag: '🇻🇦' },
    { code: '+58', label: 'Venezuela', flag: '🇻🇪' },
    { code: '+84', label: 'Vietnam', flag: '🇻🇳' },
    { code: '+681', label: 'Wallis and Futuna', flag: '🇼🇫' },
    { code: '+967', label: 'Yemen', flag: '🇾🇪' },
    { code: '+260', label: 'Zambia', flag: '🇿🇲' },
    { code: '+263', label: 'Zimbabwe', flag: '🇿🇼' }
];

export default function Auth({ onLogin }: AuthProps) {
    const [step, setStep] = useState<'phone' | 'code' | 'password'>('phone');
    const [phone, setPhone] = useState('');
    const [countryCode, setCountryCode] = useState('+91');
    const [code, setCode] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
    }, []);

    const filteredCountries = useMemo(() => {
        return COUNTRIES.filter(c =>
            c.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
            c.code.includes(searchQuery)
        );
    }, [searchQuery]);

    const handlePhoneSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        try {
            const fullPhone = `${countryCode}${phone}`;
            await invoke('login_start', { phone: fullPhone });
            setStep('code');
        } catch (err: any) {
            setError(typeof err === 'string' ? err : "Failed to send code");
        } finally {
            setLoading(false);
        }
    };

    const handleCodeSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        try {
            await invoke('login_complete', { code, password: null });
            onLogin();
        } catch (err: any) {
            const msg = typeof err === 'string' ? err : "Login failed";
            if (msg.includes("PASSWORD_REQUIRED")) {
                setStep('password');
            } else {
                setError(msg);
            }
        } finally {
            setLoading(false);
        }
    };

    const handlePasswordSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        try {
            await invoke('login_complete', { code, password });
            onLogin();
        } catch (err: any) {
            setError(typeof err === 'string' ? err : "Password incorrect");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="h-screen w-full bg-[#050505] text-white flex overflow-hidden font-sans selection:bg-blue-500/30 relative">

            {/* Window Drag Region */}
            <div data-tauri-drag-region className="absolute top-0 left-0 right-0 h-8 z-50 bg-transparent" />

            {/* Background Particles (Stars) */}
            <div className="absolute inset-0 pointer-events-none">
                {[...Array(50)].map((_, i) => (
                    <motion.div
                        key={i}
                        className="absolute bg-white rounded-full"
                        style={{
                            width: Math.random() < 0.5 ? 1 : 2,
                            height: Math.random() < 0.5 ? 1 : 2,
                            top: `${Math.random() * 100}%`,
                            left: `${Math.random() * 100}%`,
                            opacity: Math.random() * 0.5
                        }}
                        animate={{
                            opacity: [0.1, 0.5, 0.1],
                        }}
                        transition={{
                            duration: 3 + Math.random() * 5,
                            repeat: Infinity,
                            delay: Math.random() * 5,
                        }}
                    />
                ))}
            </div>

            {/* Left Panel - Form */}
            <div className="w-full md:w-[480px] flex flex-col justify-center px-12 z-20 relative bg-[#050505]/80 backdrop-blur-xl border-r border-white/5 shadow-2xl">

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6 }}
                    className="mb-12"
                >
                    <div className="flex items-center gap-2 mb-6">
                        <motion.div
                            initial={{ rotate: -180, scale: 0 }}
                            animate={{ rotate: 0, scale: 1 }}
                            transition={{ type: "spring", duration: 0.8 }}
                            className="w-10 h-10 rounded-xl bg-orange-500 flex items-center justify-center shadow-[0_0_20px_rgba(249,115,22,0.5)]"
                        >
                            <span className="font-bold text-xl">S</span>
                        </motion.div>
                        <span className="text-xl font-bold tracking-tight">Solaris</span>
                    </div>

                    <h1 className="text-4xl md:text-5xl font-light tracking-tight mb-2 leading-tight">
                        Sign in to <br />
                        <span className="font-medium text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.3)]">Solaris</span>
                    </h1>
                    <p className="text-gray-500 text-lg">using Telegram</p>
                </motion.div>

                <AnimatePresence mode="wait">
                    <motion.div
                        key={step}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 10 }}
                        transition={{ duration: 0.3 }}
                    >
                        {step === 'phone' && (
                            <form onSubmit={handlePhoneSubmit} className="space-y-6">
                                <div className="space-y-4">
                                    <label className="block text-sm font-medium text-gray-400 uppercase tracking-wider text-xs">Phone Number</label>
                                    <div className="flex gap-3">
                                        <div className="relative">
                                            <button
                                                type="button"
                                                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                                                className="h-14 bg-white/5 border border-white/10 rounded-xl px-4 flex items-center gap-2 hover:bg-white/10 hover:border-white/20 transition-all min-w-[100px] outline-none focus:ring-1 focus:ring-orange-500/50"
                                            >
                                                <span className="text-lg font-mono tracking-wide">{countryCode}</span>
                                                <ChevronDown className="w-4 h-4 text-gray-400 ml-auto" />
                                            </button>

                                            <AnimatePresence>
                                                {isDropdownOpen && (
                                                    <motion.div
                                                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                                        animate={{ opacity: 1, y: 0, scale: 1 }}
                                                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                                        className="absolute top-full left-0 mt-2 w-72 max-h-[300px] overflow-hidden bg-[#121212] border border-white/10 rounded-xl shadow-2xl z-50 flex flex-col"
                                                    >
                                                        <div className="p-3 border-b border-white/5 bg-[#121212] sticky top-0 z-10">
                                                            <div className="relative">
                                                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                                                                <input
                                                                    type="text"
                                                                    value={searchQuery}
                                                                    onChange={(e) => setSearchQuery(e.target.value)}
                                                                    placeholder="Search country..."
                                                                    className="w-full bg-white/5 border border-white/5 rounded-lg pl-9 pr-3 py-2 text-sm text-gray-200 placeholder:text-gray-600 focus:outline-none focus:bg-white/10"
                                                                    autoFocus
                                                                    onClick={(e) => e.stopPropagation()}
                                                                />
                                                            </div>
                                                        </div>

                                                        <div className="overflow-y-auto flex-1 p-1 custom-scrollbar">
                                                            {filteredCountries.map((c) => (
                                                                <button
                                                                    key={c.code + c.label}
                                                                    type="button"
                                                                    onClick={() => {
                                                                        setCountryCode(c.code);
                                                                        setIsDropdownOpen(false);
                                                                        setSearchQuery('');
                                                                    }}
                                                                    className="w-full px-3 py-2.5 text-left hover:bg-white/10 rounded-lg flex items-center justify-between group transition-colors"
                                                                >
                                                                    <div className="flex items-center gap-3">
                                                                        <span className="text-lg">{c.flag}</span>
                                                                        <span className="text-sm text-gray-300 group-hover:text-white transition-colors truncate max-w-[140px]">{c.label}</span>
                                                                    </div>
                                                                    <span className="text-xs text-gray-500 font-mono bg-white/5 px-1.5 py-0.5 rounded">{c.code}</span>
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                        </div>

                                        <input
                                            type="tel"
                                            value={phone}
                                            onChange={(e) => setPhone(e.target.value)}
                                            placeholder="98765 43210"
                                            className="flex-1 h-14 bg-white/5 border border-white/10 rounded-xl px-4 text-lg focus:outline-none focus:border-blue-500/50 focus:bg-white/10 transition-all placeholder:text-gray-600 font-medium tracking-wide"
                                            autoFocus
                                        />
                                    </div>
                                </div>

                                <motion.button
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    type="submit"
                                    disabled={loading || !phone}
                                    className="w-full h-14 bg-gradient-to-r from-orange-600 to-orange-500 text-white font-semibold rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_20px_rgba(249,115,22,0.3)] hover:shadow-[0_0_30px_rgba(249,115,22,0.5)]"
                                >
                                    {loading ? <Loader2 className="animate-spin w-5 h-5" /> : (
                                        <>
                                            Continue <ArrowRight className="w-5 h-5" />
                                        </>
                                    )}
                                </motion.button>
                            </form>
                        )}

                        {/* .. (omitted other form steps for brevity, identical to before just different color) ... */}
                        {/* Actually need to keep them as is for functionality */}
                        {step === 'code' && (
                            <form onSubmit={handleCodeSubmit} className="space-y-6">
                                <div className="space-y-4">
                                    <div className="flex justify-between items-center">
                                        <label className="text-sm font-medium text-gray-400 uppercase tracking-wider text-xs">Enter Code</label>
                                        <button type="button" onClick={() => setStep('phone')} className="text-xs text-orange-400 hover:text-orange-300 transition-colors">Change Phone</button>
                                    </div>
                                    <input
                                        type="text"
                                        value={code}
                                        onChange={(e) => setCode(e.target.value)}
                                        placeholder="xxxxx"
                                        className="w-full h-14 bg-white/5 border border-white/10 rounded-xl px-4 text-lg text-center font-mono tracking-[0.5em] focus:outline-none focus:border-orange-500/50 focus:bg-white/10 transition-all placeholder:text-gray-700"
                                        autoFocus
                                        maxLength={5}
                                    />
                                    <p className="text-xs text-center text-gray-500">We've sent a code to your Telegram app.</p>
                                </div>
                                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} type="submit" disabled={loading || code.length < 5} className="w-full h-14 bg-gradient-to-r from-orange-600 to-orange-500 text-white font-semibold rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg">{loading ? <Loader2 className="animate-spin w-5 h-5" /> : "Verify Code"}</motion.button>
                            </form>
                        )}

                        {step === 'password' && (
                            <form onSubmit={handlePasswordSubmit} className="space-y-6">
                                <div className="space-y-4">
                                    <label className="text-sm font-medium text-gray-400 uppercase tracking-wider text-xs">Two-Step Verification</label>
                                    <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your cloud password" className="w-full h-14 bg-white/5 border border-white/10 rounded-xl px-4 text-lg focus:outline-none focus:border-orange-500/50 focus:bg-white/10 transition-all placeholder:text-gray-600" autoFocus />
                                </div>
                                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} type="submit" disabled={loading} className="w-full h-14 bg-gradient-to-r from-orange-600 to-orange-500 text-white font-semibold rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50 shadow-lg">{loading ? <Loader2 className="animate-spin w-5 h-5" /> : "Unlock"}</motion.button>
                            </form>
                        )}
                    </motion.div>
                </AnimatePresence>

                {error && (
                    <motion.div initial={{ opacity: 0, marginTop: 0 }} animate={{ opacity: 1, marginTop: 16 }} className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3 text-red-200 text-sm backdrop-blur-sm">
                        <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-[0_0_10px_red]" />
                        {error}
                    </motion.div>
                )}

                <div className="absolute bottom-8 left-12 right-12 text-xs text-gray-600 text-center">
                    By signing up, you agree to our Terms and Privacy Policy.
                </div>
            </div>

            {/* Right Panel - Solar System Visual */}
            <div className="flex-1 relative overflow-hidden flex items-center justify-center bg-[#020205]">
                <SolarSystem />
            </div>
        </div>
    );
}

function SolarSystem() {
    return (
        <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
            {/* Dynamic Ambient Background */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(253,184,19,0.05)_0%,_transparent_60%)]" />

            {/* 3D Container (Tilt) */}
            <div className="relative w-[1000px] h-[1000px] scale-90" style={{ transformStyle: 'preserve-3d', transform: 'rotateX(60deg) rotateZ(-10deg)' }}>

                {/* 1. THE SUN */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 rounded-full shadow-[0_0_100px_rgba(253,186,116,0.6)] z-10"
                    style={{
                        background: 'radial-gradient(circle at center, #FFF7ED 0%, #FDBA74 40%, #EA580C 100%)',
                        boxShadow: '0 0 60px #F97316, 0 0 100px rgba(253,186,116,0.2)'
                    }}
                >
                    {/* Sun Atmosphere Pulse */}
                    <div className="absolute inset-0 rounded-full bg-orange-400 opacity-30 animate-ping" />
                </div>

                {/* 2. PLANETS (Simplified scale/distance for aesthetics) */}

                {/* Mercury */}
                <PlanetOrbit size={450} duration={10} delay={0}>
                    <div className="w-3 h-3 rounded-full bg-gray-400 shadow-[0_0_5px_gray]" />
                </PlanetOrbit>

                {/* Venus */}
                <PlanetOrbit size={550} duration={15} delay={-5}>
                    <div className="w-4 h-4 rounded-full bg-yellow-200 shadow-[0_0_10px_rgba(254,240,138,0.5)]" />
                </PlanetOrbit>

                {/* Earth */}
                <PlanetOrbit size={680} duration={20} delay={-12}>
                    <div className="w-4 h-4 rounded-full bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)]">
                        {/* Moon */}
                        <div className="absolute -top-3 left-1/2 w-1 h-1 bg-gray-300 rounded-full opacity-80" />
                    </div>
                </PlanetOrbit>

                {/* Mars */}
                <PlanetOrbit size={800} duration={25} delay={-8}>
                    <div className="w-3 h-3 rounded-full bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]" />
                </PlanetOrbit>

                {/* Jupiter */}
                <PlanetOrbit size={1100} duration={40} delay={-20}>
                    <div className="w-10 h-10 rounded-full bg-orange-200 shadow-[0_0_20px_rgba(253,186,116,0.4)] overflow-hidden flex items-center justify-center"
                        style={{ background: 'linear-gradient(45deg, #FDE68A, #D97706, #78350F)' }}>
                        {/* Bands */}
                        <div className="w-full h-1 bg-black/10 absolute top-3" />
                        <div className="w-full h-2 bg-black/10 absolute bottom-3" />
                    </div>
                </PlanetOrbit>

                {/* Saturn */}
                <PlanetOrbit size={1400} duration={55} delay={-15}>
                    <div className="relative">
                        <div className="w-8 h-8 rounded-full bg-[#EAD6A8] shadow-[0_0_15px_rgba(234,214,168,0.3)]" />
                        {/* Rings */}
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 rounded-full border-[6px] border-[#EAD6A8]/40 border-t-[#EAD6A8]/20 border-b-[#EAD6A8]/60 blur-[1px]" />
                    </div>
                </PlanetOrbit>

                {/* Uranus */}
                <PlanetOrbit size={1650} duration={70} delay={-30}>
                    <div className="w-6 h-6 rounded-full bg-cyan-300 shadow-[0_0_15px_rgba(103,232,249,0.4)] opacity-80" />
                </PlanetOrbit>

                {/* Neptune */}
                <PlanetOrbit size={1850} duration={85} delay={-40}>
                    <div className="w-6 h-6 rounded-full bg-blue-700 shadow-[0_0_15px_rgba(29,78,216,0.5)] opacity-80" />
                </PlanetOrbit>

            </div>

            <style>{`
                @keyframes orbitMove {
                    from { transform: rotate(0deg) translateX(50%) rotate(0deg); }
                    to { transform: rotate(360deg) translateX(50%) rotate(-360deg); } 
                    /* Inner rotate cancels out parent rotation so planet stays upright if 2D, 
                       but here we are in 3D transform so it rotates around Z. */
                }
            `}</style>
        </div>
    );
}

// Helper component for orbits
function PlanetOrbit({ size, duration, delay, children }: { size: number, duration: number, delay: number, children: React.ReactNode }) {
    return (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/10"
            style={{
                width: size,
                height: size,
                boxShadow: 'inset 0 0 20px rgba(255,255,255,0.02)'
            }}
        >
            <div className="absolute top-0 left-0 w-full h-full animate-[spin_linear_infinite]"
                style={{
                    animationDuration: `${duration}s`,
                    animationDelay: `${delay}s`
                }}
            >
                {/* Planet Container - Positioned at edge */}
                <div className="absolute top-1/2 right-0 -translate-y-1/2 translate-x-1/2">
                    {/* Counter-rotate to keep planet lighting consistent (optional, currently just passing children) */}
                    <div style={{ transform: 'rotateX(-60deg)' }}> {/* Correct tilt for 3D view */}
                        {children}
                    </div>
                </div>
            </div>
        </div>
    );
}
