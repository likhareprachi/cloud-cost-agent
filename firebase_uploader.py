import firebase_admin
from firebase_admin import credentials, firestore
from datetime import datetime
import os

# Only initialize once
if not firebase_admin._apps:
    # Use path absolute to workspace or standard relative to script to prevent issues
    key_path = os.path.join(os.path.dirname(__file__), "firebase-key.json")
    if os.path.exists(key_path):
        cred = credentials.Certificate(key_path)
        firebase_admin.initialize_app(cred)
    else:
        # Fallback or informative exception if running in live mode without key
        print(f"⚠️ Warning: '{key_path}' not found! Please place your Firebase private key inside backend/ folder.")

db = None
try:
    if firebase_admin._apps:
        db = firestore.client()
except Exception as e:
    print(f"⚠️ Could not instantiate Firestore client: {e}")

def save_to_firebase(recommendations, raw_data):
    if db is None:
        print("❌ Cannot save to Firebase: Firestore client is not initialized.")
        return False
    
    report = {
        "timestamp": datetime.now().isoformat(),
        "recommendations": recommendations,
        "raw_summary": {
            "total_spend": raw_data["total_monthly_spend"],
            "idle_instances": len(raw_data["idle_ec2_instances"]),
            "account": raw_data["account_name"],
            "billing_period": raw_data["billing_period"]
        },
        "status": "new"
    }
    db.collection("reports").add(report)
    print("🔥 Report successfully saved to Firebase Firestore!")
    return True

def get_all_reports():
    if db is None:
        print("❌ Cannot fetch from Firebase: Firestore client is not initialized.")
        return []
    
    reports = db.collection("reports")\
                .order_by("timestamp", direction=firestore.Query.DESCENDING)\
                .limit(10)\
                .stream()
    return [{"id": r.id, **r.to_dict()} for r in reports]
