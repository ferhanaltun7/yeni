export interface User {
user_id: string;
email: string;
name: string;
picture?: string;
monthly_income?: number;
is_premium: boolean;
created_at: string;
onboarding_completed: boolean;
}

export interface Bill {
bill_id: string;
user_id: string;
title: string;
amount: number;
due_date: string;
category: string;
is_paid: boolean;
notes?: string;
created_at: string;
paid_at?: string;
}

export interface BillCreate {
title: string;
amount: number;
due_date: string;
category: string;
notes?: string;
}

export interface Receipt {
receipt_id: string;
user_id: string;
store_name: string;
amount: number;
receipt_date: string;
category: string;
items?: ReceiptItem[];
notes?: string;
image_url?: string;
created_at: string;
}

export interface ReceiptItem {
name: string;
price: number;
quantity?: number;
}

export interface ReceiptCreate {
store_name: string;
amount: number;
receipt_date: string;
category: string;
items?: ReceiptItem[];
notes?: string;
}

export interface Category {
id: string;
name: string;
icon: string;
}

export interface DashboardStats {
total_upcoming: number;
total_overdue: number;
total_paid_this_month: number;
upcoming_count: number;
overdue_count: number;
next_bill?: {
bill_id: string;
title: string;
amount: number;
due_date: string;
category: string;
};
}

export interface ReceiptStats {
total_this_month: number;
total_all_time: number;
receipt_count: number;
by_category: Record<string, { count: number; total: number }>;
}
