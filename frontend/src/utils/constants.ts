export const COLORS = {
primary: ‘#2563EB’,
primaryLight: ‘#3B82F6’,
secondary: ‘#10B981’,
secondaryLight: ‘#34D399’,
warning: ‘#F59E0B’,
warningLight: ‘#FBBF24’,
danger: ‘#EF4444’,
dangerLight: ‘#F87171’,
background: ‘#F8FAFC’,
surface: ‘#FFFFFF’,
text: ‘#1E293B’,
textSecondary: ‘#64748B’,
textLight: ‘#94A3B8’,
border: ‘#E2E8F0’,
success: ‘#22C55E’,
};

// Bill categories
export const CATEGORY_COLORS: Record<string, string> = {
electricity: ‘#F59E0B’,
water: ‘#3B82F6’,
internet: ‘#8B5CF6’,
phone: ‘#EC4899’,
market: ‘#22C55E’,
subscriptions: ‘#EF4444’,
rent: ‘#14B8A6’,
gas: ‘#F97316’,
};

export const CATEGORY_ICONS: Record<string, string> = {
electricity: ‘flash’,
water: ‘water’,
internet: ‘wifi’,
phone: ‘call’,
market: ‘cart’,
subscriptions: ‘card’,
rent: ‘home’,
gas: ‘flame’,
};

export const CATEGORY_NAMES: Record<string, string> = {
electricity: ‘Elektrik’,
water: ‘Su’,
internet: ‘İnternet’,
phone: ‘Telefon’,
market: ‘Market’,
subscriptions: ‘Abonelikler’,
rent: ‘Kira’,
gas: ‘Doğalgaz’,
};

export const CATEGORY_GROUPS = [
{
id: ‘bills’,
name: ‘Faturalar’,
icon: ‘receipt’,
subcategories: [‘electricity’, ‘water’, ‘internet’, ‘gas’, ‘phone’],
},
{
id: ‘expenses’,
name: ‘Giderler’,
icon: ‘wallet’,
subcategories: [‘rent’, ‘market’, ‘subscriptions’],
},
];

// Receipt categories
export const RECEIPT_CATEGORY_COLORS: Record<string, string> = {
market: ‘#22C55E’,
restaurant: ‘#F59E0B’,
cafe: ‘#8B5CF6’,
fastfood: ‘#EF4444’,
clothing: ‘#EC4899’,
electronics: ‘#3B82F6’,
pharmacy: ‘#14B8A6’,
fuel: ‘#F97316’,
other: ‘#6B7280’,
};

export const RECEIPT_CATEGORY_ICONS: Record<string, string> = {
market: ‘cart’,
restaurant: ‘restaurant’,
cafe: ‘cafe’,
fastfood: ‘fast-food’,
clothing: ‘shirt’,
electronics: ‘phone-portrait’,
pharmacy: ‘medkit’,
fuel: ‘car’,
other: ‘pricetag’,
};

export const RECEIPT_CATEGORY_NAMES: Record<string, string> = {
market: ‘Market’,
restaurant: ‘Restoran’,
cafe: ‘Kafe’,
fastfood: ‘Fast Food’,
clothing: ‘Giyim’,
electronics: ‘Elektronik’,
pharmacy: ‘Eczane’,
fuel: ‘Akaryakıt’,
other: ‘Diğer’,
};

export const RECEIPT_CATEGORY_GROUPS = [
{
id: ‘shopping’,
name: ‘Alışveriş’,
icon: ‘bag’,
subcategories: [‘market’, ‘clothing’, ‘electronics’],
},
{
id: ‘food’,
name: ‘Yeme-İçme’,
icon: ‘restaurant’,
subcategories: [‘restaurant’, ‘cafe’, ‘fastfood’],
},
{
id: ‘other’,
name: ‘Diğer’,
icon: ‘ellipsis-horizontal’,
subcategories: [‘pharmacy’, ‘fuel’, ‘other’],
},
];
