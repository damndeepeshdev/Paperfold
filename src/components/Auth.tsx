import { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform } from 'framer-motion';
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

    // Mouse Tracking for Parallax
    const mouseX = useMotionValue(0);
    const mouseY = useMotionValue(0);

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            // Normalize mouse position from -1 to 1
            const { innerWidth, innerHeight } = window;
            const x = (e.clientX / innerWidth) * 2 - 1;
            const y = (e.clientY / innerHeight) * 2 - 1;
            mouseX.set(x);
            mouseY.set(y);
        };
        window.addEventListener('mousemove', handleMouseMove);
        return () => window.removeEventListener('mousemove', handleMouseMove);
    }, [mouseX, mouseY]);

    return (
        <div className="h-screen w-full bg-[#030712] text-white flex overflow-hidden font-sans selection:bg-blue-500/30 relative">

            {/* Window Drag Region */}
            {/* Window Drag Region - Fixed Position & Max Z-Index */}
            <div data-tauri-drag-region className="fixed top-0 left-0 right-0 h-10 z-[9999]" />

            {/* Background Grid Pattern (Technical Look) */}
            <div className="absolute inset-0 pointer-events-none opacity-20"
                style={{
                    backgroundImage: 'linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)',
                    backgroundSize: '40px 40px'
                }}
            />

            {/* Left Panel - Form */}
            <div className="w-full md:w-[480px] flex flex-col justify-center px-12 z-20 relative bg-transparent">

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
                            className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center shadow-[0_0_20px_rgba(37,99,235,0.5)]"
                        >
                            <span className="font-bold text-xl">P</span>
                        </motion.div>
                        <span className="text-xl font-bold tracking-tight">Paperfold</span>
                    </div>

                    <h1 className="text-4xl md:text-5xl font-light tracking-tight mb-2 leading-tight">
                        Sign in to <br />
                        <span className="font-medium text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.3)]">Paperfold</span>
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
                                                className="h-14 bg-white/5 border border-white/10 rounded-xl px-4 flex items-center gap-2 hover:bg-white/10 hover:border-white/20 transition-all min-w-[100px] outline-none focus:ring-1 focus:ring-blue-500/50"
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
                                    className="w-full h-14 bg-gradient-to-r from-blue-600 to-blue-500 text-white font-semibold rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_20px_rgba(37,99,235,0.3)] hover:shadow-[0_0_30px_rgba(37,99,235,0.5)]"
                                >
                                    {loading ? <Loader2 className="animate-spin w-5 h-5" /> : (
                                        <>
                                            Continue <ArrowRight className="w-5 h-5" />
                                        </>
                                    )}
                                </motion.button>
                            </form>
                        )}

                        {step === 'code' && (
                            <form onSubmit={handleCodeSubmit} className="space-y-6">
                                <div className="space-y-4">
                                    <div className="flex justify-between items-center">
                                        <label className="text-sm font-medium text-gray-400 uppercase tracking-wider text-xs">Enter Code</label>
                                        <button type="button" onClick={() => setStep('phone')} className="text-xs text-blue-400 hover:text-blue-300 transition-colors">Change Phone</button>
                                    </div>
                                    <input
                                        type="text"
                                        value={code}
                                        onChange={(e) => setCode(e.target.value)}
                                        placeholder="xxxxx"
                                        className="w-full h-14 bg-white/5 border border-white/10 rounded-xl px-4 text-lg text-center font-mono tracking-[0.5em] focus:outline-none focus:border-blue-500/50 focus:bg-white/10 transition-all placeholder:text-gray-700"
                                        autoFocus
                                        maxLength={5}
                                    />
                                    <p className="text-xs text-center text-gray-500">We've sent a code to your Telegram app.</p>
                                </div>
                                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} type="submit" disabled={loading || code.length < 5} className="w-full h-14 bg-gradient-to-r from-blue-600 to-blue-500 text-white font-semibold rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg">{loading ? <Loader2 className="animate-spin w-5 h-5" /> : "Verify Code"}</motion.button>
                            </form>
                        )}

                        {step === 'password' && (
                            <form onSubmit={handlePasswordSubmit} className="space-y-6">
                                <div className="space-y-4">
                                    <label className="text-sm font-medium text-gray-400 uppercase tracking-wider text-xs">Two-Step Verification</label>
                                    <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your cloud password" className="w-full h-14 bg-white/5 border border-white/10 rounded-xl px-4 text-lg focus:outline-none focus:border-blue-500/50 focus:bg-white/10 transition-all placeholder:text-gray-600" autoFocus />
                                </div>
                                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} type="submit" disabled={loading} className="w-full h-14 bg-gradient-to-r from-blue-600 to-blue-500 text-white font-semibold rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50 shadow-lg">{loading ? <Loader2 className="animate-spin w-5 h-5" /> : "Unlock"}</motion.button>
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

            {/* Right Panel - Galaxy View (Masked Arch) */}
            <div className="relative flex-1 hidden md:block h-full overflow-hidden pointer-events-none">
                {/* 1. The Arch Mask - Enhanced with border glow */}
                <div className="absolute inset-x-0 bottom-0 top-12 border-t border-l border-white/10 rounded-tl-[300px] overflow-hidden backdrop-blur-[1px] shadow-[inset_10px_10px_50px_rgba(0,0,0,0.5)]">
                    <GalaxyView mouseX={mouseX} mouseY={mouseY} />
                </div>
            </div>

        </div>
    );
}

function GalaxyView({ mouseX, mouseY }: { mouseX: any, mouseY: any }) {
    // Parallax Transforms
    const layer1X = useTransform(mouseX, [-1, 1], [30, -30]);
    const layer1Y = useTransform(mouseY, [-1, 1], [30, -30]);
    const layer2X = useTransform(mouseX, [-1, 1], [60, -60]);
    const layer2Y = useTransform(mouseY, [-1, 1], [60, -60]);

    return (
        <div className="relative w-full h-full bg-[#030712] flex items-center justify-center overflow-hidden">

            {/* 2. Rotating Galaxy - With Mouse Parallax */}
            <div className="absolute inset-0 z-0">
                {/* Slow Deep Core - Background Layer */}
                <motion.div
                    style={{ x: layer1X, y: layer1Y }}
                    animate={{ rotate: 360 }}
                    transition={{ duration: 120, repeat: Infinity, ease: "linear" }}
                    className="absolute -inset-[50%]"
                >
                    <div className="absolute inset-0"
                        style={{
                            background: 'conic-gradient(from 0deg, transparent 0%, #0c4a6e 15%, #082f49 30%, transparent 50%, #075985 70%, transparent 90%)',
                            filter: 'blur(100px) brightness(1.2)'
                        }}
                    />
                </motion.div>

                {/* Faster Outer Spirals - Foreground Layer (Moves faster with parallax) */}
                <motion.div
                    style={{ x: layer2X, y: layer2Y }}
                    animate={{ rotate: -360 }}
                    transition={{ duration: 60, repeat: Infinity, ease: "linear" }}
                    className="absolute -inset-[60%]"
                >
                    <div className="absolute inset-0"
                        style={{
                            background: 'conic-gradient(from 180deg, transparent 0%, rgba(14,165,233,0.3) 10%, transparent 25%, rgba(56,189,248,0.2) 45%, transparent 80%)',
                            filter: 'blur(60px) opacity(0.6)'
                        }}
                    />
                </motion.div>

                {/* Pulsing Core Center */}
                <motion.div
                    style={{ x: layer1X, y: layer1Y }}
                    animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0.8, 0.5] }}
                    transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-blue-500/20 rounded-full blur-[80px]"
                />
            </div>

            {/* 3. Twinkling Stars + 5. Shooting Stars */}
            <div className="absolute inset-0 z-10">
                {[...Array(60)].map((_, i) => (
                    <motion.div
                        key={i}
                        className="absolute bg-white rounded-full shadow-[0_0_2px_white]"
                        style={{
                            top: `${Math.random() * 100}%`,
                            left: `${Math.random() * 100}%`,
                            width: Math.random() < 0.7 ? 1 : 2,
                            height: Math.random() < 0.7 ? 1 : 2,
                        }}
                        animate={{ opacity: [0.1, 0.8, 0.1], scale: [1, 1.2, 1] }}
                        transition={{
                            duration: 2 + Math.random() * 3,
                            repeat: Infinity,
                            delay: Math.random() * 5
                        }}
                    />
                ))}
                <ShootingStarSpawner />
            </div>

            {/* 6. Warp Dust Particles */}
            <div className="absolute inset-0 z-10 overflow-hidden">
                <WarpDust />
            </div>


            {/* 4. Technical Overlays (Dynamic) */}
            <div className="absolute inset-0 border border-white/5 m-8 rounded-tl-[280px] z-20">

                {/* Center Crosshair - Drifting */}
                <motion.div
                    animate={{ y: [-5, 5, -5], x: [-3, 3, -3] }}
                    transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 border border-white/10"
                >
                    <div className="absolute top-0 bottom-0 left-1/2 w-[1px] bg-white/20" />
                    <div className="absolute left-0 right-0 top-1/2 h-[1px] bg-white/20" />

                    {/* Holographic Glitch effect on crosshair */}
                    <motion.div
                        animate={{ opacity: [0, 0.5, 0] }}
                        transition={{ duration: 0.1, repeat: Infinity, repeatDelay: 5 }}
                        className="absolute inset-0 border border-blue-400 translate-x-[2px] opacity-0"
                    />
                    <motion.div
                        animate={{ opacity: [0, 0.5, 0] }}
                        transition={{ duration: 0.1, repeat: Infinity, repeatDelay: 7 }}
                        className="absolute inset-0 border border-red-400 -translate-x-[2px] opacity-0"
                    />
                </motion.div>

                {/* Scanning Radar Line */}
                <motion.div
                    animate={{ top: ['0%', '100%'], opacity: [0, 1, 0] }}
                    transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
                    className="absolute left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent"
                />
                <motion.div
                    animate={{ left: ['0%', '100%'], opacity: [0, 1, 0] }}
                    transition={{ duration: 6, repeat: Infinity, ease: "linear", delay: 2 }}
                    className="absolute top-0 bottom-0 w-[1px] bg-gradient-to-b from-transparent via-cyan-500/50 to-transparent"
                />

                {/* Rotating Dashed Rings */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[70%] h-[70%] rounded-full border border-dashed border-white/5 animate-[spin_100s_linear_infinite]" />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[40%] h-[40%] rounded-full border border-dashed border-white/5 animate-[spin_60s_linear_infinite_reverse]" />

                {/* Data Points */}
                <div className="absolute top-1/3 left-[60%] text-[10px] font-mono text-cyan-500/60 leading-tight">
                    <TypewriterText text="sector: orion-09" delay={0} />
                    <TypewriterText text="status: active" delay={1} />
                    <div className="flex gap-2">
                        <span>coords:</span>
                        <motion.span
                            animate={{ opacity: [0.5, 1, 0.5] }}
                            transition={{ duration: 0.5, repeat: Infinity }}
                        >
                            45.2891, 12.002
                        </motion.span>
                    </div>
                </div>
            </div>

        </div>
    );
}

function ShootingStarSpawner() {
    return (
        <>
            <ShootingStar delay={2} />
            <ShootingStar delay={7} />
            <ShootingStar delay={12} />
        </>
    );
}

function ShootingStar({ delay }: { delay: number }) {
    return (
        <motion.div
            initial={{ left: '-10%', top: '40%', opacity: 0, scale: 0 }}
            animate={{
                left: ['-10%', '120%'],
                top: ['40%', '60%'],
                opacity: [0, 1, 0],
                scale: [0.5, 1, 0.5]
            }}
            transition={{
                duration: 1.5,
                repeat: Infinity,
                repeatDelay: delay + Math.random() * 5,
                ease: "easeIn"
            }}
            className="absolute h-[1px] w-[100px] bg-gradient-to-r from-transparent via-white to-transparent rotate-12 z-0"
        >
            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1 h-1 bg-white rounded-full shadow-[0_0_5px_white]" />
        </motion.div>
    );
}

function WarpDust() {
    return (
        <>
            {[...Array(20)].map((_, i) => (
                <motion.div
                    key={`dust-${i}`}
                    initial={{
                        opacity: 0,
                        scale: 0,
                        x: Math.random() * 800 - 400,
                        y: Math.random() * 800 - 400
                    }}
                    animate={{
                        opacity: [0, 0.5, 0],
                        scale: [0, 2],
                        z: [0, 500] // not real Z without preserve-3d parent context but scaling simulates it
                    }}
                    transition={{
                        duration: 3 + Math.random() * 4,
                        repeat: Infinity,
                        delay: Math.random() * 5,
                        ease: "linear"
                    }}
                    className="absolute top-1/2 left-1/2 w-1 h-1 bg-white/20 rounded-full"
                />
            ))}
        </>
    );
}

// Small helper for typewriter effect on static text
function TypewriterText({ text, delay }: { text: string, delay: number }) {
    return (
        <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay, duration: 0.5 }}
        >
            {text}
        </motion.p>
    );
}
