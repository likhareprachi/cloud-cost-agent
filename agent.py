import groq
import json
import os
import sys
from dotenv import load_dotenv
from mock_aws_data import get_mock_aws_data
from firebase_uploader import save_to_firebase

# Load env variables from the root or local directory
load_dotenv()
if not os.getenv("GROQ_API_KEY"):
    # Also search parent directory for convenience if run from inside backend/
    load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

def run_agent():
    print("\n🤖 Cloud Cost Optimization Agent Starting...")
    print("=" * 50)

    # Step 1: Get AWS data
    print("📊 Fetching AWS infrastructure data...")
    aws_data = get_mock_aws_data()
    print(f"   Found {len(aws_data['idle_ec2_instances'])} idle instances")
    print(f"   Current monthly spend: ${aws_data['total_monthly_spend']}")

    # Step 2: Send to Groq
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key or api_key == "your_actual_api_key_here":
        print("\n❌ Error: GROQ_API_KEY is not set or is still the default value!")
        print("💡 Action required:")
        print("   1. Open the '.env' file in the project folder.")
        print("   2. Replace 'your_actual_api_key_here' with your real Groq API key.")
        print("   3. Re-run this script.\n")
        sys.exit(1)

    print("\n🧠 Sending to Groq AI (Llama 3 70B) for analysis...")
    client = groq.Groq(api_key=api_key)

    prompt = f"""
    You are a Cloud Cost Optimization AI Agent for DevOps teams.
    Analyze this AWS data and return ONLY a valid JSON object. No extra text.

    Return this exact JSON structure:
    {{
        "total_potential_monthly_savings_usd": <number>,
        "waste_percentage": <number>,
        "severity": "HIGH",
        "summary": "<2 sentence summary>",
        "predicted_next_month_spend": <number>,
        "immediate_actions": [
            {{
                "action": "<what to do>",
                "resource": "<resource id or name>",
                "monthly_saving_usd": <number>,
                "risk": "Safe",
                "how_to_do_it": "<simple step>"
            }}
        ],
        "resize_recommendations": [
            {{
                "resource": "<name>",
                "current": "<size>",
                "recommended": "<size>",
                "monthly_saving_usd": <number>,
                "reason": "<why>"
            }}
        ],
        "cost_anomalies": [
            {{
                "service": "<name>",
                "anomaly": "<what is weird>",
                "impact": "<cost impact>"
            }}
        ]
    }}

    AWS Data:
    {json.dumps(aws_data, indent=2)}
    """

    model_name = "llama3-70b-8192"  # standard reliable model name on Groq
    try:
        # Utilize Groq's native JSON mode for absolute formatting reliability
        chat_completion = client.chat.completions.create(
            messages=[{"role": "user", "content": prompt}],
            model=model_name,
            response_format={"type": "json_object"}
        )
        raw = chat_completion.choices[0].message.content
    except Exception as e:
        print(f"⚠️ Failed calling model '{model_name}'. Trying fallback 'mixtral-8x7b-32768'... Error detail: {e}")
        try:
            chat_completion = client.chat.completions.create(
                messages=[{"role": "user", "content": prompt}],
                model="mixtral-8x7b-32768",
                response_format={"type": "json_object"}
            )
            raw = chat_completion.choices[0].message.content
        except Exception as e2:
            print(f"❌ Failed to communicate with Groq API: {e2}")
            sys.exit(1)

    try:
        clean = raw.replace("```json", "").replace("```", "").strip()
        recommendations = json.loads(clean)
    except Exception as je:
        print(f"❌ Failed to parse JSON response from Groq: {je}")
        print(f"Raw response: {raw}")
        sys.exit(1)

    savings = recommendations.get('total_potential_monthly_savings_usd', 0)
    print(f"✅ Groq Analysis Complete!")
    print(f"   💰 Potential savings found: ${savings}/month")
    print(f"   ⚠️  Severity: {recommendations.get('severity', 'HIGH')}")

    # Step 3: Save to Firebase
    print("\n🔥 Saving report to Firebase...")
    success = save_to_firebase(recommendations, aws_data)
    if success:
        print("\n✅ Agent run complete! Check your dashboard.\n")
    else:
        print("\n⚠️ Agent run completed with Firebase upload warnings. Check local details above.\n")
        
    return recommendations

if __name__ == "__main__":
    run_agent()
