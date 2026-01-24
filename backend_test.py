#!/usr/bin/env python3
"""
Backend API Testing for Bütçe Asistanı (Bill Buddy)
Tests all backend endpoints with proper authentication
"""

import requests
import json
import subprocess
import time
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any

# Configuration
BACKEND_URL = "https://billscan-9.preview.emergentagent.com/api"
TEST_USER_EMAIL = f"test.user.{int(time.time())}@example.com"
TEST_USER_NAME = "Test User"

class BillBuddyTester:
    def __init__(self):
        self.session_token: Optional[str] = None
        self.user_id: Optional[str] = None
        self.test_bills = []
        self.results = {
            "health_check": False,
            "categories": False,
            "auth_me": False,
            "bills_create": False,
            "bills_list": False,
            "bills_get": False,
            "bills_update": False,
            "bills_toggle_paid": False,
            "bills_delete": False,
            "dashboard_stats": False
        }
        
    def log(self, message: str, level: str = "INFO"):
        """Log test messages"""
        timestamp = datetime.now().strftime("%H:%M:%S")
        print(f"[{timestamp}] {level}: {message}")
        
    def create_test_user_and_session(self) -> bool:
        """Create test user and session using mongosh"""
        try:
            self.log("Creating test user and session...")
            
            # Generate unique IDs
            timestamp = int(time.time())
            user_id = f"user_{timestamp}"
            session_token = f"test_session_{timestamp}"
            
            # MongoDB command to create user and session
            mongo_command = f"""
            use('test_database');
            var visitorId = '{user_id}';
            var sessionToken = '{session_token}';
            var email = '{TEST_USER_EMAIL}';
            
            db.users.insertOne({{
              user_id: visitorId,
              email: email,
              name: '{TEST_USER_NAME}',
              picture: 'https://via.placeholder.com/150',
              monthly_income: null,
              is_premium: false,
              created_at: new Date(),
              onboarding_completed: false
            }});
            
            db.user_sessions.insertOne({{
              user_id: visitorId,
              session_token: sessionToken,
              expires_at: new Date(Date.now() + 7*24*60*60*1000),
              created_at: new Date()
            }});
            
            print('SUCCESS: User and session created');
            print('Session token: ' + sessionToken);
            print('User ID: ' + visitorId);
            """
            
            # Execute mongosh command
            result = subprocess.run(
                ["mongosh", "--eval", mongo_command],
                capture_output=True,
                text=True,
                timeout=30
            )
            
            if result.returncode == 0:
                self.session_token = session_token
                self.user_id = user_id
                self.log(f"✅ Test user created: {user_id}")
                self.log(f"✅ Session token: {session_token}")
                return True
            else:
                self.log(f"❌ Failed to create test user: {result.stderr}", "ERROR")
                return False
                
        except Exception as e:
            self.log(f"❌ Error creating test user: {str(e)}", "ERROR")
            return False
    
    def make_request(self, method: str, endpoint: str, data: Dict = None, auth: bool = True) -> requests.Response:
        """Make HTTP request to backend API"""
        url = f"{BACKEND_URL}{endpoint}"
        headers = {"Content-Type": "application/json"}
        
        if auth and self.session_token:
            headers["Authorization"] = f"Bearer {self.session_token}"
            
        try:
            if method.upper() == "GET":
                response = requests.get(url, headers=headers, timeout=10)
            elif method.upper() == "POST":
                response = requests.post(url, headers=headers, json=data, timeout=10)
            elif method.upper() == "PUT":
                response = requests.put(url, headers=headers, json=data, timeout=10)
            elif method.upper() == "DELETE":
                response = requests.delete(url, headers=headers, timeout=10)
            else:
                raise ValueError(f"Unsupported method: {method}")
                
            return response
        except requests.exceptions.RequestException as e:
            self.log(f"❌ Request failed: {str(e)}", "ERROR")
            raise
    
    def test_health_check(self) -> bool:
        """Test health check endpoints"""
        try:
            self.log("Testing health check endpoints...")
            
            # Test root endpoint
            response = self.make_request("GET", "/", auth=False)
            if response.status_code == 200:
                data = response.json()
                if "message" in data and "Bütçe Asistanı API" in data["message"]:
                    self.log("✅ Root endpoint working")
                else:
                    self.log("❌ Root endpoint response invalid")
                    return False
            else:
                self.log(f"❌ Root endpoint failed: {response.status_code}")
                return False
            
            # Test health endpoint
            response = self.make_request("GET", "/health", auth=False)
            if response.status_code == 200:
                data = response.json()
                if data.get("status") == "healthy":
                    self.log("✅ Health endpoint working")
                    return True
                else:
                    self.log("❌ Health endpoint response invalid")
                    return False
            else:
                self.log(f"❌ Health endpoint failed: {response.status_code}")
                return False
                
        except Exception as e:
            self.log(f"❌ Health check error: {str(e)}", "ERROR")
            return False
    
    def test_categories(self) -> bool:
        """Test categories endpoint (no auth required)"""
        try:
            self.log("Testing categories endpoint...")
            
            response = self.make_request("GET", "/categories", auth=False)
            if response.status_code == 200:
                categories = response.json()
                if isinstance(categories, list) and len(categories) > 0:
                    # Check if categories have required fields
                    first_cat = categories[0]
                    if "id" in first_cat and "name" in first_cat and "icon" in first_cat:
                        self.log(f"✅ Categories endpoint working ({len(categories)} categories)")
                        return True
                    else:
                        self.log("❌ Categories missing required fields")
                        return False
                else:
                    self.log("❌ Categories response invalid")
                    return False
            else:
                self.log(f"❌ Categories endpoint failed: {response.status_code}")
                return False
                
        except Exception as e:
            self.log(f"❌ Categories test error: {str(e)}", "ERROR")
            return False
    
    def test_auth_me(self) -> bool:
        """Test /api/auth/me endpoint"""
        try:
            self.log("Testing auth/me endpoint...")
            
            response = self.make_request("GET", "/auth/me")
            if response.status_code == 200:
                user_data = response.json()
                if "user_id" in user_data and "email" in user_data:
                    self.log(f"✅ Auth/me working - User: {user_data.get('name', 'Unknown')}")
                    return True
                else:
                    self.log("❌ Auth/me response missing required fields")
                    return False
            else:
                self.log(f"❌ Auth/me failed: {response.status_code} - {response.text}")
                return False
                
        except Exception as e:
            self.log(f"❌ Auth/me test error: {str(e)}", "ERROR")
            return False
    
    def test_bills_create(self) -> bool:
        """Test creating bills"""
        try:
            self.log("Testing bill creation...")
            
            # Test data for bills
            test_bills_data = [
                {
                    "title": "Elektrik Faturası",
                    "amount": 450.75,
                    "due_date": (datetime.now() + timedelta(days=15)).isoformat(),
                    "category": "electricity",
                    "notes": "Aylık elektrik faturası"
                },
                {
                    "title": "Su Faturası", 
                    "amount": 120.50,
                    "due_date": (datetime.now() + timedelta(days=10)).isoformat(),
                    "category": "water"
                },
                {
                    "title": "İnternet Faturası",
                    "amount": 89.99,
                    "due_date": (datetime.now() + timedelta(days=5)).isoformat(),
                    "category": "internet"
                }
            ]
            
            created_bills = []
            for bill_data in test_bills_data:
                response = self.make_request("POST", "/bills", data=bill_data)
                if response.status_code == 200:
                    bill = response.json()
                    if "bill_id" in bill and "title" in bill:
                        created_bills.append(bill)
                        self.log(f"✅ Created bill: {bill['title']} (ID: {bill['bill_id']})")
                    else:
                        self.log("❌ Created bill missing required fields")
                        return False
                else:
                    self.log(f"❌ Bill creation failed: {response.status_code} - {response.text}")
                    return False
            
            self.test_bills = created_bills
            self.log(f"✅ Successfully created {len(created_bills)} bills")
            return True
            
        except Exception as e:
            self.log(f"❌ Bill creation test error: {str(e)}", "ERROR")
            return False
    
    def test_bills_list(self) -> bool:
        """Test listing all bills"""
        try:
            self.log("Testing bills list...")
            
            response = self.make_request("GET", "/bills")
            if response.status_code == 200:
                bills = response.json()
                if isinstance(bills, list):
                    self.log(f"✅ Bills list working ({len(bills)} bills)")
                    return True
                else:
                    self.log("❌ Bills list response not a list")
                    return False
            else:
                self.log(f"❌ Bills list failed: {response.status_code} - {response.text}")
                return False
                
        except Exception as e:
            self.log(f"❌ Bills list test error: {str(e)}", "ERROR")
            return False
    
    def test_bills_get(self) -> bool:
        """Test getting individual bills"""
        try:
            if not self.test_bills:
                self.log("❌ No test bills available for individual get test")
                return False
                
            self.log("Testing individual bill retrieval...")
            
            for bill in self.test_bills[:2]:  # Test first 2 bills
                bill_id = bill["bill_id"]
                response = self.make_request("GET", f"/bills/{bill_id}")
                if response.status_code == 200:
                    bill_data = response.json()
                    if bill_data.get("bill_id") == bill_id:
                        self.log(f"✅ Retrieved bill: {bill_data['title']}")
                    else:
                        self.log("❌ Retrieved bill ID mismatch")
                        return False
                else:
                    self.log(f"❌ Bill retrieval failed: {response.status_code}")
                    return False
            
            return True
            
        except Exception as e:
            self.log(f"❌ Bill get test error: {str(e)}", "ERROR")
            return False
    
    def test_bills_update(self) -> bool:
        """Test updating bills"""
        try:
            if not self.test_bills:
                self.log("❌ No test bills available for update test")
                return False
                
            self.log("Testing bill updates...")
            
            # Update first bill
            bill = self.test_bills[0]
            bill_id = bill["bill_id"]
            
            update_data = {
                "title": "Updated Elektrik Faturası",
                "amount": 500.00,
                "notes": "Updated notes"
            }
            
            response = self.make_request("PUT", f"/bills/{bill_id}", data=update_data)
            if response.status_code == 200:
                updated_bill = response.json()
                if (updated_bill.get("title") == update_data["title"] and 
                    updated_bill.get("amount") == update_data["amount"]):
                    self.log(f"✅ Updated bill: {updated_bill['title']}")
                    return True
                else:
                    self.log("❌ Bill update data mismatch")
                    return False
            else:
                self.log(f"❌ Bill update failed: {response.status_code} - {response.text}")
                return False
                
        except Exception as e:
            self.log(f"❌ Bill update test error: {str(e)}", "ERROR")
            return False
    
    def test_bills_toggle_paid(self) -> bool:
        """Test toggling bill paid status"""
        try:
            if not self.test_bills:
                self.log("❌ No test bills available for toggle paid test")
                return False
                
            self.log("Testing bill paid status toggle...")
            
            # Toggle paid status for second bill
            bill = self.test_bills[1] if len(self.test_bills) > 1 else self.test_bills[0]
            bill_id = bill["bill_id"]
            
            response = self.make_request("POST", f"/bills/{bill_id}/toggle-paid")
            if response.status_code == 200:
                updated_bill = response.json()
                if "is_paid" in updated_bill:
                    paid_status = updated_bill["is_paid"]
                    self.log(f"✅ Toggled bill paid status to: {paid_status}")
                    return True
                else:
                    self.log("❌ Toggle paid response missing is_paid field")
                    return False
            else:
                self.log(f"❌ Toggle paid failed: {response.status_code} - {response.text}")
                return False
                
        except Exception as e:
            self.log(f"❌ Toggle paid test error: {str(e)}", "ERROR")
            return False
    
    def test_dashboard_stats(self) -> bool:
        """Test dashboard statistics"""
        try:
            self.log("Testing dashboard statistics...")
            
            response = self.make_request("GET", "/dashboard/stats")
            if response.status_code == 200:
                stats = response.json()
                required_fields = ["total_upcoming", "total_overdue", "total_paid_this_month", 
                                 "upcoming_count", "overdue_count"]
                
                if all(field in stats for field in required_fields):
                    self.log(f"✅ Dashboard stats working - Upcoming: {stats['upcoming_count']}, Overdue: {stats['overdue_count']}")
                    return True
                else:
                    self.log("❌ Dashboard stats missing required fields")
                    return False
            else:
                self.log(f"❌ Dashboard stats failed: {response.status_code} - {response.text}")
                return False
                
        except Exception as e:
            self.log(f"❌ Dashboard stats test error: {str(e)}", "ERROR")
            return False
    
    def test_bills_delete(self) -> bool:
        """Test deleting bills"""
        try:
            if not self.test_bills:
                self.log("❌ No test bills available for delete test")
                return False
                
            self.log("Testing bill deletion...")
            
            # Delete last bill
            bill = self.test_bills[-1]
            bill_id = bill["bill_id"]
            
            response = self.make_request("DELETE", f"/bills/{bill_id}")
            if response.status_code == 200:
                result = response.json()
                if "message" in result:
                    self.log(f"✅ Deleted bill: {bill['title']}")
                    return True
                else:
                    self.log("❌ Delete response missing message")
                    return False
            else:
                self.log(f"❌ Bill deletion failed: {response.status_code} - {response.text}")
                return False
                
        except Exception as e:
            self.log(f"❌ Bill delete test error: {str(e)}", "ERROR")
            return False
    
    def run_all_tests(self) -> Dict[str, bool]:
        """Run all backend tests"""
        self.log("=" * 60)
        self.log("STARTING BÜTÇE ASISTANI BACKEND API TESTS")
        self.log("=" * 60)
        
        # Step 1: Create test user and session
        if not self.create_test_user_and_session():
            self.log("❌ CRITICAL: Failed to create test user and session")
            return self.results
        
        # Step 2: Test health check
        self.results["health_check"] = self.test_health_check()
        
        # Step 3: Test categories (no auth)
        self.results["categories"] = self.test_categories()
        
        # Step 4: Test auth/me
        self.results["auth_me"] = self.test_auth_me()
        
        # Step 5: Test bills CRUD
        self.results["bills_create"] = self.test_bills_create()
        self.results["bills_list"] = self.test_bills_list()
        self.results["bills_get"] = self.test_bills_get()
        self.results["bills_update"] = self.test_bills_update()
        self.results["bills_toggle_paid"] = self.test_bills_toggle_paid()
        
        # Step 6: Test dashboard stats
        self.results["dashboard_stats"] = self.test_dashboard_stats()
        
        # Step 7: Test bill deletion (last to avoid affecting other tests)
        self.results["bills_delete"] = self.test_bills_delete()
        
        # Print summary
        self.print_summary()
        
        return self.results
    
    def print_summary(self):
        """Print test results summary"""
        self.log("=" * 60)
        self.log("TEST RESULTS SUMMARY")
        self.log("=" * 60)
        
        passed = 0
        total = len(self.results)
        
        for test_name, result in self.results.items():
            status = "✅ PASS" if result else "❌ FAIL"
            self.log(f"{test_name.replace('_', ' ').title()}: {status}")
            if result:
                passed += 1
        
        self.log("=" * 60)
        self.log(f"OVERALL: {passed}/{total} tests passed ({(passed/total)*100:.1f}%)")
        
        if passed == total:
            self.log("🎉 ALL TESTS PASSED!")
        else:
            self.log("⚠️  Some tests failed - check logs above")

def main():
    """Main test execution"""
    tester = BillBuddyTester()
    results = tester.run_all_tests()
    
    # Return exit code based on results
    if all(results.values()):
        exit(0)  # All tests passed
    else:
        exit(1)  # Some tests failed

if __name__ == "__main__":
    main()