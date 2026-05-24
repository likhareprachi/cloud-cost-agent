def get_mock_aws_data():
    return {
        "account_name": "TechStartup Pvt Ltd",
        "billing_period": "May 2026",
        "total_monthly_spend": 4250.00,

        "services_breakdown": [
            {"service": "EC2 (Virtual Servers)", "cost": 2100.00, "last_month": 1800.00},
            {"service": "RDS (Database)",        "cost": 890.00,  "last_month": 890.00},
            {"service": "S3 (Storage)",          "cost": 340.00,  "last_month": 200.00},
            {"service": "Lambda (Functions)",    "cost": 920.00,  "last_month": 750.00},
        ],

        "idle_ec2_instances": [
            {
                "instance_id": "i-0a1b2c3d4",
                "instance_type": "m5.2xlarge",
                "region": "ap-south-1",
                "avg_cpu_7days": 0.8,
                "running_days": 23,
                "monthly_cost_usd": 280.00,
                "last_used": "2026-04-30",
                "purpose": "staging-server"
            },
            {
                "instance_id": "i-0e5f6g7h8",
                "instance_type": "t3.large",
                "region": "ap-south-1",
                "avg_cpu_7days": 2.1,
                "running_days": 45,
                "monthly_cost_usd": 67.50,
                "last_used": "2026-05-01",
                "purpose": "old-ml-experiment"
            },
            {
                "instance_id": "i-0i9j0k1l2",
                "instance_type": "c5.xlarge",
                "region": "us-east-1",
                "avg_cpu_7days": 3.4,
                "running_days": 67,
                "monthly_cost_usd": 123.00,
                "last_used": "2026-04-15",
                "purpose": "load-testing-server"
            }
        ],

        "oversized_databases": [
            {
                "db_id": "prod-mysql-01",
                "current_size": "db.r5.2xlarge",
                "actual_connections_avg": 12,
                "max_connections_allowed": 1000,
                "storage_used_gb": 45,
                "storage_allocated_gb": 500,
                "monthly_cost_usd": 890.00,
                "recommended_size": "db.t3.medium"
            }
        ],

        "unused_storage": [
            {
                "bucket_name": "company-logs-backup-2024",
                "size_gb": 890,
                "last_accessed": "2025-11-01",
                "monthly_cost_usd": 20.50
            },
            {
                "bucket_name": "old-build-artifacts",
                "size_gb": 340,
                "last_accessed": "2025-09-15",
                "monthly_cost_usd": 7.80
            }
        ]
    }
