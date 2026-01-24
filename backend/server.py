from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Response
from fastapi.security import HTTPBearer
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import base64
import re
import json
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
import uuid
from datetime import datetime, timezone, timedelta
import httpx

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ.get('DB_NAME', 'test_database')]

# Emergent LLM Key for AI parsing
EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY', '')

# Google Cloud Vision API Key for OCR
GOOGLE_VISION_API_KEY = os.environ.get('GOOGLE_CLOUD_VISION_API_KEY', '')

# App shared secret for mobile auth
APP_SHARED_SECRET = os.environ.get('APP_SHARED_SECRET', '')

# Create the main app
app = FastAPI(title="Bütçe Asistanı API")

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

logger = logging.getLogger(__name__)

# ============== MODELS ==============

class User(BaseModel):
    user_id: str
    email: str
    name: str
    picture: Optional[str] = None
    monthly_income: Optional[float] = None
    is_premium: bool = False
    created_at: datetime
    onboarding_completed: bool = False

class UserOnboarding(BaseModel):
    name: str
    monthly_income: Optional[float] = None

class Bill(BaseModel):
    bill_id: str = Field(default_factory=lambda: f"bill_{uuid.uuid4().hex[:12]}")
    user_id: str
    title: str
    amount: float
    due_date: datetime
    category: str  # electricity, water, internet, market, subscriptions, other
    is_paid: bool = False
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    paid_at: Optional[datetime] = None

class BillCreate(BaseModel):
    title: str
    amount: float
    due_date: str  # ISO format date string
    category: str
    notes: Optional[str] = None

class BillUpdate(BaseModel):
    title: Optional[str] = None
    amount: Optional[float] = None
    due_date: Optional[str] = None
    category: Optional[str] = None
    notes: Optional[str] = None
    is_paid: Optional[bool] = None

class SessionDataResponse(BaseModel):
    id: str
    email: str
    name: str
    picture: Optional[str] = None
    session_token: str

class DashboardStats(BaseModel):
    total_upcoming: float
    total_overdue: float
    total_paid_this_month: float
    upcoming_count: int
    overdue_count: int
    next_bill: Optional[dict] = None

# ============== AUTH HELPERS ==============

async def get_session_token(request: Request) -> Optional[str]:
    """Extract session token from cookie or Authorization header"""
    # Try cookie first
    session_token = request.cookies.get("session_token")
    if session_token:
        return session_token
    
    # Try Authorization header
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        return auth_header[7:]
    
    return None

async def get_current_user(request: Request) -> User:
    """Get current authenticated user"""
    session_token = await get_session_token(request)
    if not session_token:
        raise HTTPException(status_code=401, detail="Oturum bulunamadı")
    
    # Find session
    session = await db.user_sessions.find_one(
        {"session_token": session_token},
        {"_id": 0}
    )
    if not session:
        raise HTTPException(status_code=401, detail="Geçersiz oturum")
    
    # Check expiry with timezone awareness
    expires_at = session["expires_at"]
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    
    if expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Oturum süresi doldu")
    
    # Find user
    user_doc = await db.users.find_one(
        {"user_id": session["user_id"]},
        {"_id": 0}
    )
    if not user_doc:
        raise HTTPException(status_code=401, detail="Kullanıcı bulunamadı")
    
    return User(**user_doc)

async def get_optional_user(request: Request) -> Optional[User]:
    """Get current user if authenticated, None otherwise"""
    try:
        return await get_current_user(request)
    except HTTPException:
        return None

# ============== AUTH ROUTES ==============

@api_router.post("/auth/session")
async def exchange_session(request: Request, response: Response):
    """Exchange session_id for session_token and create/update user"""
    session_id = request.headers.get("X-Session-ID")
    if not session_id:
        raise HTTPException(status_code=400, detail="Session ID gerekli")
    
    # Call Emergent Auth API
    async with httpx.AsyncClient() as client_http:
        try:
            auth_response = await client_http.get(
                "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
                headers={"X-Session-ID": session_id},
                timeout=10.0
            )
            if auth_response.status_code != 200:
                raise HTTPException(status_code=401, detail="Geçersiz session ID")
            
            user_data = auth_response.json()
        except httpx.RequestError as e:
            logger.error(f"Auth API error: {e}")
            raise HTTPException(status_code=500, detail="Kimlik doğrulama hatası")
    
    session_data = SessionDataResponse(**user_data)
    
    # Check if user exists
    existing_user = await db.users.find_one(
        {"email": session_data.email},
        {"_id": 0}
    )
    
    if existing_user:
        user_id = existing_user["user_id"]
    else:
        # Create new user
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        new_user = {
            "user_id": user_id,
            "email": session_data.email,
            "name": session_data.name,
            "picture": session_data.picture,
            "monthly_income": None,
            "is_premium": False,
            "created_at": datetime.now(timezone.utc),
            "onboarding_completed": False
        }
        await db.users.insert_one(new_user)
    
    # Create session
    session_doc = {
        "user_id": user_id,
        "session_token": session_data.session_token,
        "expires_at": datetime.now(timezone.utc) + timedelta(days=7),
        "created_at": datetime.now(timezone.utc)
    }
    await db.user_sessions.insert_one(session_doc)
    
    # Set cookie
    response.set_cookie(
        key="session_token",
        value=session_data.session_token,
        httponly=True,
        secure=True,
        samesite="none",
        max_age=7 * 24 * 60 * 60,
        path="/"
    )
    
    # Get user for response
    user_doc = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    
    return {
        "user": user_doc,
        "session_token": session_data.session_token
    }

@api_router.get("/auth/me")
async def get_me(current_user: User = Depends(get_current_user)):
    """Get current user info"""
    return current_user

@api_router.post("/auth/logout")
async def logout(request: Request, response: Response):
    """Logout and clear session"""
    session_token = await get_session_token(request)
    if session_token:
        await db.user_sessions.delete_one({"session_token": session_token})
    
    response.delete_cookie("session_token", path="/")
    return {"message": "Çıkış yapıldı"}

@api_router.put("/auth/onboarding")
async def complete_onboarding(
    data: UserOnboarding,
    current_user: User = Depends(get_current_user)
):
    """Complete user onboarding"""
    await db.users.update_one(
        {"user_id": current_user.user_id},
        {"$set": {
            "name": data.name,
            "monthly_income": data.monthly_income,
            "onboarding_completed": True
        }}
    )
    
    user_doc = await db.users.find_one({"user_id": current_user.user_id}, {"_id": 0})
    return User(**user_doc)

# ============== BILL ROUTES ==============

@api_router.get("/bills", response_model=List[Bill])
async def get_bills(current_user: User = Depends(get_current_user)):
    """Get all bills for current user"""
    bills = await db.bills.find(
        {"user_id": current_user.user_id},
        {"_id": 0}
    ).sort("due_date", 1).to_list(1000)
    return [Bill(**bill) for bill in bills]

@api_router.post("/bills", response_model=Bill)
async def create_bill(
    bill_data: BillCreate,
    current_user: User = Depends(get_current_user)
):
    """Create a new bill"""
    # Parse due_date
    try:
        due_date = datetime.fromisoformat(bill_data.due_date.replace('Z', '+00:00'))
        if due_date.tzinfo is None:
            due_date = due_date.replace(tzinfo=timezone.utc)
    except ValueError:
        raise HTTPException(status_code=400, detail="Geçersiz tarih formatı")
    
    bill = Bill(
        user_id=current_user.user_id,
        title=bill_data.title,
        amount=bill_data.amount,
        due_date=due_date,
        category=bill_data.category,
        notes=bill_data.notes
    )
    
    await db.bills.insert_one(bill.dict())
    return bill

@api_router.get("/bills/{bill_id}", response_model=Bill)
async def get_bill(
    bill_id: str,
    current_user: User = Depends(get_current_user)
):
    """Get a specific bill"""
    bill = await db.bills.find_one(
        {"bill_id": bill_id, "user_id": current_user.user_id},
        {"_id": 0}
    )
    if not bill:
        raise HTTPException(status_code=404, detail="Fatura bulunamadı")
    return Bill(**bill)

@api_router.put("/bills/{bill_id}", response_model=Bill)
async def update_bill(
    bill_id: str,
    bill_data: BillUpdate,
    current_user: User = Depends(get_current_user)
):
    """Update a bill"""
    bill = await db.bills.find_one(
        {"bill_id": bill_id, "user_id": current_user.user_id},
        {"_id": 0}
    )
    if not bill:
        raise HTTPException(status_code=404, detail="Fatura bulunamadı")
    
    update_data = {}
    if bill_data.title is not None:
        update_data["title"] = bill_data.title
    if bill_data.amount is not None:
        update_data["amount"] = bill_data.amount
    if bill_data.due_date is not None:
        try:
            due_date = datetime.fromisoformat(bill_data.due_date.replace('Z', '+00:00'))
            if due_date.tzinfo is None:
                due_date = due_date.replace(tzinfo=timezone.utc)
            update_data["due_date"] = due_date
        except ValueError:
            raise HTTPException(status_code=400, detail="Geçersiz tarih formatı")
    if bill_data.category is not None:
        update_data["category"] = bill_data.category
    if bill_data.notes is not None:
        update_data["notes"] = bill_data.notes
    if bill_data.is_paid is not None:
        update_data["is_paid"] = bill_data.is_paid
        if bill_data.is_paid:
            update_data["paid_at"] = datetime.now(timezone.utc)
        else:
            update_data["paid_at"] = None
    
    if update_data:
        await db.bills.update_one(
            {"bill_id": bill_id, "user_id": current_user.user_id},
            {"$set": update_data}
        )
    
    updated_bill = await db.bills.find_one(
        {"bill_id": bill_id, "user_id": current_user.user_id},
        {"_id": 0}
    )
    return Bill(**updated_bill)

@api_router.delete("/bills/{bill_id}")
async def delete_bill(
    bill_id: str,
    current_user: User = Depends(get_current_user)
):
    """Delete a bill"""
    result = await db.bills.delete_one(
        {"bill_id": bill_id, "user_id": current_user.user_id}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Fatura bulunamadı")
    return {"message": "Fatura silindi"}

@api_router.post("/bills/{bill_id}/toggle-paid", response_model=Bill)
async def toggle_bill_paid(
    bill_id: str,
    current_user: User = Depends(get_current_user)
):
    """Toggle bill paid status"""
    bill = await db.bills.find_one(
        {"bill_id": bill_id, "user_id": current_user.user_id},
        {"_id": 0}
    )
    if not bill:
        raise HTTPException(status_code=404, detail="Fatura bulunamadı")
    
    new_paid_status = not bill.get("is_paid", False)
    update_data = {
        "is_paid": new_paid_status,
        "paid_at": datetime.now(timezone.utc) if new_paid_status else None
    }
    
    await db.bills.update_one(
        {"bill_id": bill_id, "user_id": current_user.user_id},
        {"$set": update_data}
    )
    
    updated_bill = await db.bills.find_one(
        {"bill_id": bill_id, "user_id": current_user.user_id},
        {"_id": 0}
    )
    return Bill(**updated_bill)

# ============== DASHBOARD ROUTES ==============

@api_router.get("/dashboard/stats", response_model=DashboardStats)
async def get_dashboard_stats(current_user: User = Depends(get_current_user)):
    """Get dashboard statistics"""
    now = datetime.now(timezone.utc)
    start_of_month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    
    # Get all user bills
    bills = await db.bills.find(
        {"user_id": current_user.user_id},
        {"_id": 0}
    ).to_list(1000)
    
    total_upcoming = 0
    total_overdue = 0
    total_paid_this_month = 0
    upcoming_count = 0
    overdue_count = 0
    next_bill = None
    next_bill_date = None
    
    for bill in bills:
        due_date = bill["due_date"]
        if due_date.tzinfo is None:
            due_date = due_date.replace(tzinfo=timezone.utc)
        
        is_paid = bill.get("is_paid", False)
        amount = bill.get("amount", 0)
        
        if is_paid:
            paid_at = bill.get("paid_at")
            if paid_at:
                if paid_at.tzinfo is None:
                    paid_at = paid_at.replace(tzinfo=timezone.utc)
                if paid_at >= start_of_month:
                    total_paid_this_month += amount
        else:
            if due_date < now:
                total_overdue += amount
                overdue_count += 1
            else:
                total_upcoming += amount
                upcoming_count += 1
                # Track next upcoming bill
                if next_bill_date is None or due_date < next_bill_date:
                    next_bill_date = due_date
                    next_bill = {
                        "bill_id": bill["bill_id"],
                        "title": bill["title"],
                        "amount": amount,
                        "due_date": due_date.isoformat(),
                        "category": bill["category"]
                    }
    
    return DashboardStats(
        total_upcoming=total_upcoming,
        total_overdue=total_overdue,
        total_paid_this_month=total_paid_this_month,
        upcoming_count=upcoming_count,
        overdue_count=overdue_count,
        next_bill=next_bill
    )

# ============== CATEGORIES ==============

# Grouped categories structure
CATEGORY_GROUPS = [
    {
        "id": "bills",
        "name": "Faturalar",
        "icon": "receipt",
        "subcategories": [
            {"id": "electricity", "name": "Elektrik", "icon": "flash"},
            {"id": "water", "name": "Su", "icon": "water"},
            {"id": "internet", "name": "İnternet", "icon": "wifi"},
            {"id": "gas", "name": "Doğalgaz", "icon": "flame"},
            {"id": "phone", "name": "Telefon", "icon": "call"},
        ]
    },
    {
        "id": "expenses",
        "name": "Giderler",
        "icon": "wallet",
        "subcategories": [
            {"id": "rent", "name": "Kira", "icon": "home"},
            {"id": "market", "name": "Market", "icon": "cart"},
            {"id": "subscriptions", "name": "Abonelikler", "icon": "card"},
        ]
    }
]

# Flat categories for backward compatibility
CATEGORIES = []
for group in CATEGORY_GROUPS:
    for sub in group["subcategories"]:
        CATEGORIES.append({**sub, "group_id": group["id"], "group_name": group["name"]})

@api_router.get("/categories")
async def get_categories():
    """Get bill categories (flat list)"""
    return CATEGORIES

@api_router.get("/category-groups")
async def get_category_groups():
    """Get bill categories grouped"""
    return CATEGORY_GROUPS

# ============== OCR / BILL SCANNING ==============

class OcrBillRequest(BaseModel):
    imageBase64: str
    mimeType: str = "image/jpeg"

class ParsedField(BaseModel):
    value: Optional[str] = None
    confidence: float = 0.0
    evidence: List[str] = []

class ParsedBillData(BaseModel):
    biller_name: ParsedField
    due_date: ParsedField
    amount_due: ParsedField
    currency: ParsedField

class OcrBillResponse(BaseModel):
    rawText: str
    parsed: ParsedBillData

# Turkish month names for date parsing
TR_MONTHS = {
    'ocak': '01', 'şubat': '02', 'mart': '03', 'nisan': '04',
    'mayıs': '05', 'haziran': '06', 'temmuz': '07', 'ağustos': '08',
    'eylül': '09', 'ekim': '10', 'kasım': '11', 'aralık': '12'
}

def verify_app_secret(request: Request):
    """Verify x-app-secret header"""
    secret = request.headers.get("x-app-secret")
    if not APP_SHARED_SECRET or secret != APP_SHARED_SECRET:
        raise HTTPException(status_code=401, detail="Unauthorized")

async def call_vision_api(image_base64: str) -> Optional[str]:
    """Call Google Cloud Vision DOCUMENT_TEXT_DETECTION"""
    if not GOOGLE_VISION_API_KEY:
        return None
    
    try:
        url = f"https://vision.googleapis.com/v1/images:annotate?key={GOOGLE_VISION_API_KEY}"
        payload = {
            "requests": [{
                "image": {"content": image_base64},
                "features": [{"type": "DOCUMENT_TEXT_DETECTION", "maxResults": 1}],
                "imageContext": {"languageHints": ["tr", "en"]}
            }]
        }
        
        async with httpx.AsyncClient() as client:
            response = await client.post(url, json=payload, timeout=30.0)
            if response.status_code != 200:
                logger.error(f"Vision API error: {response.status_code}")
                return None
            
            result = response.json()
            if "responses" in result and result["responses"]:
                full_text = result["responses"][0].get("fullTextAnnotation", {})
                return full_text.get("text", "")
        return None
    except Exception as e:
        logger.error(f"Vision API error: {e}")
        return None

def parse_turkish_amount(text: str) -> tuple[Optional[float], List[str]]:
    """Parse Turkish amount format: 1.250,75 TL -> 1250.75"""
    evidence = []
    patterns = [
        (r'(?:ödenecek tutar|tahsil edilecek tutar|genel toplam|toplam tutar|toplam|amount due)[:\s]*([0-9.,]+)\s*(?:tl|₺)?', 0.9),
        (r'([0-9]{1,3}(?:\.[0-9]{3})*,[0-9]{2})\s*(?:tl|₺)', 0.7),
        (r'([0-9]+,[0-9]{2})\s*(?:tl|₺)', 0.6),
    ]
    
    for pattern, conf in patterns:
        matches = re.findall(pattern, text.lower())
        for match in matches:
            try:
                # Clean: 1.250,75 -> 1250.75
                clean = match.replace('.', '').replace(',', '.')
                amount = float(clean)
                if 0.01 < amount < 100000:
                    # Find evidence line
                    for line in text.split('\n'):
                        if match in line.lower() or str(int(amount)) in line:
                            evidence.append(line.strip()[:100])
                            break
                    return amount, evidence[:2]
            except:
                continue
    return None, []

def parse_turkish_date(text: str) -> tuple[Optional[str], List[str]]:
    """Parse Turkish date formats to ISO YYYY-MM-DD"""
    evidence = []
    
    # Keywords for due date
    date_keywords = ['son ödeme tarihi', 'son odeme tarihi', 'vade', 'ödeme tarihi', 'due date', 's.ö.t']
    
    # Find lines with keywords
    relevant_lines = []
    for line in text.split('\n'):
        line_lower = line.lower()
        for kw in date_keywords:
            if kw in line_lower:
                relevant_lines.append(line)
                break
    
    # Date patterns
    patterns = [
        r'(\d{1,2})[./\-](\d{1,2})[./\-](\d{4})',  # DD.MM.YYYY
        r'(\d{1,2})[./\-](\d{1,2})[./\-](\d{2})',   # DD.MM.YY
        r'(\d{1,2})\s+(ocak|şubat|mart|nisan|mayıs|haziran|temmuz|ağustos|eylül|ekim|kasım|aralık)\s+(\d{4})',  # DD Month YYYY
    ]
    
    search_text = '\n'.join(relevant_lines) if relevant_lines else text
    
    for pattern in patterns:
        matches = re.finditer(pattern, search_text.lower())
        for match in matches:
            try:
                groups = match.groups()
                if len(groups) == 3:
                    if groups[1] in TR_MONTHS:
                        # Turkish month name
                        day = int(groups[0])
                        month = int(TR_MONTHS[groups[1]])
                        year = int(groups[2])
                    else:
                        day = int(groups[0])
                        month = int(groups[1])
                        year = int(groups[2])
                        if year < 100:
                            year += 2000
                    
                    if 1 <= day <= 31 and 1 <= month <= 12 and 2024 <= year <= 2030:
                        iso_date = f"{year}-{month:02d}-{day:02d}"
                        # Find evidence
                        for line in text.split('\n'):
                            if match.group(0) in line.lower():
                                evidence.append(line.strip()[:100])
                                break
                        return iso_date, evidence[:2]
            except:
                continue
    return None, []

def parse_biller_name(text: str) -> tuple[Optional[str], List[str]]:
    """Extract biller/company name"""
    evidence = []
    lines = text.split('\n')
    
    # Known billers
    known_billers = {
        'enerjisa': 'Enerjisa', 'tedaş': 'TEDAŞ', 'bedaş': 'BEDAŞ', 'aydem': 'Aydem',
        'iski': 'İSKİ', 'aski': 'ASKİ', 'izsu': 'İZSU', 'buski': 'BUSKİ',
        'igdaş': 'İGDAŞ', 'egegaz': 'EgeGaz', 'başkentgaz': 'BaşkentGaz',
        'türk telekom': 'Türk Telekom', 'superonline': 'Superonline', 'vodafone': 'Vodafone',
        'turkcell': 'Turkcell', 'denizli büyükşehir': 'Denizli Büyükşehir Belediyesi',
        'istanbul büyükşehir': 'İstanbul Büyükşehir Belediyesi',
    }
    
    text_lower = text.lower()
    for key, name in known_billers.items():
        if key in text_lower:
            for line in lines[:5]:
                if key in line.lower():
                    evidence.append(line.strip()[:100])
                    break
            return name, evidence[:2]
    
    # Try first non-empty lines (usually header)
    for line in lines[:3]:
        clean = line.strip()
        if len(clean) > 5 and not any(c.isdigit() for c in clean[:5]):
            evidence.append(clean[:100])
            return clean[:50], evidence
    
    return None, []

def detect_currency(text: str) -> tuple[str, List[str]]:
    """Detect currency"""
    evidence = []
    text_lower = text.lower()
    
    if 'tl' in text_lower or '₺' in text or 'türk lirası' in text_lower:
        for line in text.split('\n'):
            if 'tl' in line.lower() or '₺' in line:
                evidence.append(line.strip()[:100])
                break
        return 'TRY', evidence[:1]
    
    if 'usd' in text_lower or '$' in text:
        return 'USD', ['Currency detected: USD']
    if 'eur' in text_lower or '€' in text:
        return 'EUR', ['Currency detected: EUR']
    
    return 'TRY', ['Default currency: TRY']

@api_router.post("/ocr/bill", response_model=OcrBillResponse)
async def ocr_bill(request: Request, body: OcrBillRequest):
    """OCR endpoint with AI-powered parsing and confidence scoring"""
    
    # Verify app secret
    verify_app_secret(request)
    
    # Clean base64
    image_base64 = body.imageBase64
    if image_base64.startswith("data:"):
        image_base64 = image_base64.split(",")[1]
    
    # Call Vision API
    raw_text = await call_vision_api(image_base64)
    
    if not raw_text:
        return OcrBillResponse(
            rawText="",
            parsed=ParsedBillData(
                biller_name=ParsedField(value=None, confidence=0, evidence=[]),
                due_date=ParsedField(value=None, confidence=0, evidence=[]),
                amount_due=ParsedField(value=None, confidence=0, evidence=[]),
                currency=ParsedField(value=None, confidence=0, evidence=[])
            )
        )
    
    logger.info(f"OCR extracted {len(raw_text)} chars")
    
    # Use AI for smart parsing
    ai_result = await parse_bill_with_ai_v2(raw_text)
    
    # Fallback to regex if AI fails
    if not ai_result:
        biller, biller_ev = parse_biller_name(raw_text)
        due_date, date_ev = parse_turkish_date(raw_text)
        amount, amount_ev = parse_turkish_amount(raw_text)
        currency, curr_ev = detect_currency(raw_text)
        
        return OcrBillResponse(
            rawText=raw_text[:2000],
            parsed=ParsedBillData(
                biller_name=ParsedField(
                    value=biller,
                    confidence=0.6 if biller else 0.0,
                    evidence=biller_ev
                ),
                due_date=ParsedField(
                    value=due_date,
                    confidence=0.5 if due_date else 0.0,
                    evidence=date_ev
                ),
                amount_due=ParsedField(
                    value=str(amount) if amount else None,
                    confidence=0.5 if amount else 0.0,
                    evidence=amount_ev
                ),
                currency=ParsedField(
                    value=currency,
                    confidence=0.95,
                    evidence=curr_ev
                )
            )
        )
    
    # Use AI results
    return OcrBillResponse(
        rawText=raw_text[:2000],
        parsed=ParsedBillData(
            biller_name=ParsedField(
                value=ai_result.get("biller_name"),
                confidence=ai_result.get("biller_confidence", 0.85),
                evidence=[ai_result.get("biller_evidence", "")] if ai_result.get("biller_evidence") else []
            ),
            due_date=ParsedField(
                value=ai_result.get("due_date"),
                confidence=ai_result.get("due_date_confidence", 0.85),
                evidence=[ai_result.get("due_date_evidence", "")] if ai_result.get("due_date_evidence") else []
            ),
            amount_due=ParsedField(
                value=str(ai_result.get("amount")) if ai_result.get("amount") else None,
                confidence=ai_result.get("amount_confidence", 0.85),
                evidence=[ai_result.get("amount_evidence", "")] if ai_result.get("amount_evidence") else []
            ),
            currency=ParsedField(
                value=ai_result.get("currency", "TRY"),
                confidence=0.95,
                evidence=["TL detected"]
            )
        )
    )


async def parse_bill_with_ai_v2(ocr_text: str) -> Optional[dict]:
    """Parse OCR text with AI - improved version for Turkish bills"""
    if not EMERGENT_LLM_KEY:
        return None
    
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"bill_parse_{uuid.uuid4().hex[:8]}",
            system_message="""Sen bir Türk fatura analiz uzmanısın. OCR metninden fatura bilgilerini çıkar.

ÖNEMLİ KURALLAR:
1. "Son Ödeme Tarihi" veya "S.Ö.T." veya "Vade Tarihi" yazan tarihi bul - bu SON ÖDEME TARİHİdir
2. "Fatura Tarihi" veya "Düzenleme Tarihi" SON ÖDEME TARİHİ DEĞİLDİR, bunları ATLA
3. "Ödenecek Tutar", "Toplam Borç", "Tahsil Edilecek Tutar", "Genel Toplam" yazan miktarı bul
4. Şirket/kurum adını bul (Enerjisa, TEDAŞ, İSKİ, İGDAŞ, Türk Telekom vs.)

ÇIKTI FORMATI (SADECE JSON):
{
  "biller_name": "Şirket Adı",
  "biller_confidence": 0.9,
  "biller_evidence": "metinden örnek satır",
  "amount": 456.78,
  "amount_confidence": 0.9,
  "amount_evidence": "metinden örnek satır",
  "due_date": "2025-02-15",
  "due_date_confidence": 0.9,
  "due_date_evidence": "SON ÖDEME TARİHİ: 15.02.2025",
  "currency": "TRY"
}

Türk para formatı: 1.234,56 TL = 1234.56 (nokta binlik, virgül ondalık)
Tarih formatı çıktıda: YYYY-MM-DD

Bulamazsan null yaz, tahmin yapma. Confidence: kesin=0.95, muhtemel=0.7, belirsiz=0.4"""
        ).with_model("openai", "gpt-4o-mini")
        
        response = await chat.send_message(UserMessage(text=f"Fatura OCR metni:\n\n{ocr_text[:4000]}"))
        
        clean = response.strip()
        if clean.startswith("```"):
            clean = re.sub(r'^```(?:json)?\n?', '', clean)
            clean = re.sub(r'\n?```$', '', clean)
        
        result = json.loads(clean)
        logger.info(f"AI parse result: {result}")
        return result
    except Exception as e:
        logger.error(f"AI parse v2 error: {e}")
        return None

# Keep old endpoint for backward compatibility
class BillScanRequest(BaseModel):
    image_base64: str

class BillScanResponse(BaseModel):
    success: bool
    title: Optional[str] = None
    amount: Optional[float] = None
    due_date: Optional[str] = None
    category: Optional[str] = None
    raw_text: Optional[str] = None
    error: Optional[str] = None

async def parse_bill_with_ai(ocr_text: str) -> dict:
    """Parse OCR text with AI"""
    if not EMERGENT_LLM_KEY:
        return {}
    
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"bill_parse_{uuid.uuid4().hex[:8]}",
            system_message="""Sen bir Türk fatura analiz uzmanısın. OCR metninden fatura bilgilerini çıkar.

Çıkarılacak bilgiler:
1. title: Şirket + fatura türü (örn: "Enerjisa Elektrik Faturası")
2. amount: Ödenecek tutar (sayı: 456.78)
3. due_date: Son ödeme (YYYY-MM-DD)
4. category: electricity/water/gas/internet/phone/rent/market/subscriptions

SADECE JSON döndür:
{"title": "...", "amount": 123.45, "due_date": "2025-01-20", "category": "..."}

Bulamazsan null yaz."""
        ).with_model("openai", "gpt-4o-mini")
        
        response = await chat.send_message(UserMessage(text=f"Fatura metni:\n{ocr_text[:3000]}"))
        
        clean = response.strip()
        if clean.startswith("```"):
            clean = re.sub(r'^```(?:json)?\n?', '', clean)
            clean = re.sub(r'\n?```$', '', clean)
        
        return json.loads(clean)
    except Exception as e:
        logger.error(f"AI parse error: {e}")
        return {}

@api_router.post("/bills/scan", response_model=BillScanResponse)
async def scan_bill(request: Request, body: BillScanRequest, current_user: User = Depends(get_current_user)):
    """Legacy scan endpoint with AI parsing"""
    try:
        image_base64 = body.image_base64
        if image_base64.startswith("data:"):
            image_base64 = image_base64.split(",")[1]
        
        raw_text = await call_vision_api(image_base64)
        
        if not raw_text or len(raw_text) < 10:
            return BillScanResponse(success=False, error="Metin bulunamadı")
        
        logger.info(f"OCR: {len(raw_text)} chars")
        
        parsed = await parse_bill_with_ai(raw_text)
        
        return BillScanResponse(
            success=True,
            title=parsed.get("title"),
            amount=float(parsed["amount"]) if parsed.get("amount") else None,
            due_date=parsed.get("due_date"),
            category=parsed.get("category"),
            raw_text=raw_text[:800]
        )
    except Exception as e:
        logger.error(f"Scan error: {e}")
        return BillScanResponse(success=False, error=str(e))

# ============== HEALTH CHECK ==============

@api_router.get("/")
async def root():
    return {"message": "Bütçe Asistanı API", "status": "ok"}

@api_router.get("/health")
async def health_check():
    return {"status": "healthy"}

# Include the router
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
