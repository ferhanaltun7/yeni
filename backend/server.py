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

# Emergent LLM Key for OCR
EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY', '')

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

@api_router.post("/bills/scan", response_model=BillScanResponse)
async def scan_bill(
    request: BillScanRequest,
    current_user: User = Depends(get_current_user)
):
    """Scan a bill image and extract information using AI"""
    if not EMERGENT_LLM_KEY:
        raise HTTPException(status_code=500, detail="OCR servisi yapılandırılmamış")
    
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage, FileContent
        
        # Initialize chat with vision model
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"ocr_{current_user.user_id}_{uuid.uuid4().hex[:8]}",
            system_message="""Sen bir fatura analiz asistanısın. Türkçe fatura görsellerini analiz edip bilgileri çıkarıyorsun.
            
Görseldeki faturadan şu bilgileri çıkar:
1. Fatura başlığı/türü (örn: Elektrik Faturası, Su Faturası, vb.)
2. Ödenecek tutar (TL cinsinden, sadece sayı)
3. Son ödeme tarihi (YYYY-MM-DD formatında)
4. Kategori (şunlardan biri olmalı: electricity, water, internet, gas, phone, rent, market, subscriptions)

Yanıtını SADECE JSON formatında ver, başka bir şey yazma:
{"title": "...", "amount": 123.45, "due_date": "2025-01-20", "category": "..."}

Eğer bir bilgiyi bulamazsan o alan için null yaz."""
        ).with_model("openai", "gpt-4o")
        
        # Create file content for image
        file_content = FileContent(
            content_type="image/jpeg",
            file_content_base64=request.image_base64
        )
        
        # Send message with image
        user_message = UserMessage(
            text="Bu fatura görselini analiz et ve bilgileri JSON formatında çıkar.",
            file_contents=[file_content]
        )
        
        response = await chat.send_message(user_message)
        
        # Parse JSON response
        try:
            # Clean response - remove markdown code blocks if present
            clean_response = response.strip()
            if clean_response.startswith("```"):
                clean_response = re.sub(r'^```(?:json)?\n?', '', clean_response)
                clean_response = re.sub(r'\n?```$', '', clean_response)
            
            data = json.loads(clean_response)
            
            return BillScanResponse(
                success=True,
                title=data.get("title"),
                amount=float(data["amount"]) if data.get("amount") else None,
                due_date=data.get("due_date"),
                category=data.get("category"),
                raw_text=response
            )
        except json.JSONDecodeError:
            return BillScanResponse(
                success=False,
                raw_text=response,
                error="Fatura bilgileri okunamadı. Lütfen daha net bir fotoğraf çekin."
            )
            
    except Exception as e:
        logger.error(f"OCR error: {e}")
        return BillScanResponse(
            success=False,
            error=f"Fatura taraması başarısız: {str(e)}"
        )

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
