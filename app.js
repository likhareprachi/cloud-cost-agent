/* ===================================================
   CLOUD COST AGENT - MODERN CORE LOGIC & CHARTING
   =================================================== */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-app.js";
import { getFirestore, collection, onSnapshot, query, orderBy, limit }
    from "https://www.gstatic.com/firebasejs/10.0.0/firebase-firestore.js";

// ==========================================
// 🔴 REPLACE THESE WITH YOUR FIREBASE CONFIG
// ==========================================
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT.appspot.com",
};

// Global App State
let isFirebaseConnected = false;
let dbInstance = null;
let activeEnvironment = "all"; // all, production, staging, development
let currentReportData = null;   // holds currently loaded active dataset
let resolvedActions = new Set(); // holds IDs of resolved optimizations

// Sandbox/Default dataset structure
const sandboxData = {
    timestamp: new Date().toISOString(),
    raw_summary: {
        total_spend: 4250.00,
        idle_instances: 3,
        account: "TechStartup Pvt Ltd",
        billing_period: "May 2026"
    },
    recommendations: {
        total_potential_monthly_savings_usd: 487.00,
        waste_percentage: 11.4,
        severity: "HIGH",
        predicted_next_month_spend: 3763.00,
        summary: "Identified substantial waste in dev-test assets. 3 idle EC2 instances and an over-allocated RDS database represent 85% of total optimization potential.",
        immediate_actions: [
            {
                id: "act-01",
                action: "Shutdown idle instance (Staging)",
                resource: "i-0a1b2c3d4 (m5.2xlarge)",
                monthly_saving_usd: 280.00,
                risk: "Safe",
                env: "staging",
                how_to_do_it: "Terminate stack or schedule nightly down times in ap-south-1"
            },
            {
                id: "act-02",
                action: "Decommission load-testing server",
                resource: "i-0i9j0k1l2 (c5.xlarge)",
                monthly_saving_usd: 123.00,
                risk: "Low Risk",
                env: "development",
                how_to_do_it: "Create final EBS snapshot and terminate EC2 instance"
            },
            {
                id: "act-03",
                action: "Deprecate expired experiment machine",
                resource: "i-0e5f6g7h8 (t3.large)",
                monthly_saving_usd: 67.50,
                risk: "Review First",
                env: "development",
                how_to_do_it: "Coordinate with ML team to confirm old experiment is fully abandoned"
            }
        ],
        resize_recommendations: [
            {
                id: "res-01",
                resource: "prod-mysql-01 (RDS)",
                current: "db.r5.2xlarge",
                recommended: "db.t3.medium",
                monthly_saving_usd: 840.00,
                env: "production",
                reason: "Database current connection average is 12 (max allowance: 1000). Highly oversized for current transaction volume."
            }
        ],
        cost_anomalies: [
            {
                id: "anom-01",
                service: "S3 (Storage)",
                anomaly: "Cost spiked +70% month-over-month",
                env: "development",
                impact: "+$140.00 USD increase due to raw build artifacts accumulation"
            },
            {
                id: "anom-02",
                service: "Lambda (Functions)",
                anomaly: "Execution count doubled in 7 days",
                env: "production",
                impact: "+$170.00 USD increase driven by recursive error logging loops"
            }
        ]
    }
};

// Boot-up Initialization
document.addEventListener("DOMContentLoaded", () => {
    setupEventListeners();
    
    // Set default sandbox data so page has a visual starting point
    currentReportData = JSON.parse(JSON.stringify(sandboxData));
    updateDashboard();
    
    // Connect to Firebase if configured
    const isConfigValid = firebaseConfig.apiKey && 
                           firebaseConfig.apiKey !== "YOUR_API_KEY" && 
                           firebaseConfig.projectId && 
                           firebaseConfig.projectId !== "YOUR_PROJECT_ID";
                           
    if (isConfigValid) {
        try {
            console.log("🔥 Initializing Firebase Connection...");
            const app = initializeApp(firebaseConfig);
            dbInstance = getFirestore(app);
            isFirebaseConnected = true;
            updateConnectionBadge(true);
            listenForFirebaseReports();
        } catch (e) {
            console.warn("❌ Firebase failed to initialize:", e);
            fallbackToSandbox();
        }
    } else {
        fallbackToSandbox();
    }
});

// Setup DOM Event Listeners
function setupEventListeners() {
    // Run Agent Trigger
    const runBtn = document.getElementById("run-agent-btn");
    if (runBtn) {
        runBtn.addEventListener("click", () => {
            runAgentSimulation();
        });
    }

    // Export Button Option
    const exportBtn = document.getElementById("export-json-btn");
    if (exportBtn) {
        exportBtn.addEventListener("click", () => {
            exportJSONReport();
        });
    }

    // Environment Tab Selector Buttons
    const tabs = document.querySelectorAll(".tab-btn");
    tabs.forEach(tab => {
        tab.addEventListener("click", (e) => {
            tabs.forEach(t => t.classList.remove("active"));
            tab.classList.add("active");
            
            activeEnvironment = tab.getAttribute("data-env");
            
            // Update UI Scope Label in CoPilot sidebar
            const scopeLabel = document.getElementById("current-scope-pill");
            if (scopeLabel) {
                scopeLabel.textContent = tab.textContent.trim();
            }
            
            updateDashboard();
        });
    });

    // Groq Cost CoPilot Chat Inputs
    const sendBtn = document.getElementById("copilot-send-btn");
    const chatInput = document.getElementById("copilot-input");
    
    if (sendBtn && chatInput) {
        sendBtn.addEventListener("click", () => handleCopilotSubmit());
        chatInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter") handleCopilotSubmit();
        });
    }

    // Quick Question Action Chips
    const chips = document.querySelectorAll(".quick-chip-btn");
    chips.forEach(chip => {
        chip.addEventListener("click", () => {
            const query = chip.getAttribute("data-query");
            if (query) handleCopilotSubmit(query);
        });
    });
}

// Fallback logic
function fallbackToSandbox() {
    console.log("🎮 Running in Demo Sandbox Mode...");
    isFirebaseConnected = false;
    updateConnectionBadge(false);
    
    const alertEl = document.getElementById("firebase-alert");
    if (alertEl) alertEl.style.display = "flex";
}

// Update connection status indicators
function updateConnectionBadge(isLive) {
    const badge = document.getElementById("connection-status");
    if (!badge) return;
    
    const textEl = badge.querySelector(".status-text");
    if (isLive) {
        badge.className = "status-indicator-badge state-live";
        if (textEl) textEl.textContent = "Live Sync Active";
    } else {
        badge.className = "status-indicator-badge state-demo";
        if (textEl) textEl.textContent = "Demo Sandbox";
    }
}

// Listen for Firestore collection updates
function listenForFirebaseReports() {
    if (!dbInstance) return;
    
    const q = query(
        collection(dbInstance, "reports"),
        orderBy("timestamp", "desc"),
        limit(1)
    );
    
    onSnapshot(q, (snapshot) => {
        if (snapshot.empty) return;
        
        snapshot.forEach((doc) => {
            console.log("🔥 Fetching new report from Firestore...");
            const data = doc.data();
            
            // Format data tags to ensure environments are mapped correctly
            if (data.recommendations && data.recommendations.immediate_actions) {
                data.recommendations.immediate_actions.forEach((act, idx) => {
                    act.id = act.id || `act-${idx}`;
                    if (!act.env) {
                        act.env = act.resource.toLowerCase().includes("staging") ? "staging" : "development";
                    }
                });
            }
            if (data.recommendations && data.recommendations.resize_recommendations) {
                data.recommendations.resize_recommendations.forEach((res, idx) => {
                    res.id = res.id || `res-${idx}`;
                    res.env = res.env || "production";
                });
            }
            if (data.recommendations && data.recommendations.cost_anomalies) {
                data.recommendations.cost_anomalies.forEach((anom, idx) => {
                    anom.id = anom.id || `anom-${idx}`;
                    anom.env = anom.env || (anom.service.toLowerCase().includes("lambda") ? "production" : "development");
                });
            }

            currentReportData = data;
            resolvedActions.clear(); // Reset action progress on a new report
            updateDashboard();
        });
    });
}

// Trigger Interactive Scan Simulation
function runAgentSimulation() {
    const loadingBox = document.getElementById("loading");
    if (loadingBox) loadingBox.style.display = "flex";
    
    const subtext = document.getElementById("loading-sub");
    const steps = [
        "Connecting to cloud billing endpoints...",
        "Scanning EC2 cloud instance statistics...",
        "Evaluating database connection pools...",
        "Querying S3 backup bucket last-accessed dates...",
        "Generating optimized sizing via Groq Llama 3..."
    ];
    
    let stepIdx = 0;
    const interval = setInterval(() => {
        if (subtext && stepIdx < steps.length) {
            subtext.textContent = steps[stepIdx++];
        }
    }, 600);

    setTimeout(() => {
        clearInterval(interval);
        if (loadingBox) loadingBox.style.display = "none";
        
        // Deep copy sandbox data
        currentReportData = JSON.parse(JSON.stringify(sandboxData));
        resolvedActions.clear();
        updateDashboard();
        
        if (!isFirebaseConnected) {
            alert("✨ Sandbox Simulation Complete!\n\nThe dashboard has updated locally with high-fidelity Groq AWS cost analysis.");
        } else {
            alert("✨ Local layout updated. Run 'python agent.py' in the backend terminal to sync real Firestore reports!");
        }
    }, 3200);
}

// Render dynamic elements based on environmental scope & resolved actions
function updateDashboard() {
    if (!currentReportData) return;
    
    const rec = currentReportData.recommendations;
    const raw = currentReportData.raw_summary;
    const timestamp = currentReportData.timestamp;

    // 1. Filter elements according to environmental scope
    const filterByEnv = (item) => {
        if (activeEnvironment === "all") return true;
        return item.env === activeEnvironment;
    };

    const activeActions = rec.immediate_actions.filter(filterByEnv);
    const activeResizes = rec.resize_recommendations.filter(filterByEnv);
    const activeAnomalies = rec.cost_anomalies.filter(filterByEnv);

    // 2. Resolve calculations
    // Calculate total potential savings for active scope
    const totalPotentialSavings = activeActions.reduce((sum, item) => sum + item.monthly_saving_usd, 0) +
                                  activeResizes.reduce((sum, item) => sum + item.monthly_saving_usd, 0);

    // Calculate applied optimizations (resolved actions)
    let realizedSavings = 0;
    rec.immediate_actions.forEach(item => {
        if (resolvedActions.has(item.id) && filterByEnv(item)) {
            realizedSavings += item.monthly_saving_usd;
        }
    });

    // Adjust metrics dynamically
    const netSavingsLeft = totalPotentialSavings - realizedSavings;
    const initialSpend = raw.total_spend;
    const netCurrentSpend = initialSpend - realizedSavings;
    const netPredictedSpend = initialSpend - totalPotentialSavings; // target optimized spend
    
    const initialWastePct = rec.waste_percentage;
    const netWastePct = Math.max(0, ((netSavingsLeft / netCurrentSpend) * 100).toFixed(1));

    // 3. Update DOM Stats Elements
    document.getElementById('total-savings').textContent = `$${netSavingsLeft.toFixed(2)}/mo`;
    document.getElementById('current-spend').textContent = `$${netCurrentSpend.toFixed(2)}/mo`;
    document.getElementById('predicted-spend').textContent = `$${netPredictedSpend.toFixed(2)}/mo`;
    document.getElementById('waste-pct').textContent = `${netWastePct}%`;
    
    // AI Assessment Summary Block
    document.getElementById('ai-summary').textContent = rec.summary;
    const badge = document.getElementById('severity-badge');
    if (badge) {
        badge.textContent = rec.severity;
        badge.className = `badge badge-${rec.severity.toLowerCase()}`;
    }
    
    // Timestamp
    document.getElementById('last-updated').textContent = new Date(timestamp).toLocaleString('en-IN');
    
    // 4. Render Immediate Actions Checklist with interactive resolution switches
    const actionsEl = document.getElementById('immediate-actions');
    if (activeActions.length > 0) {
        actionsEl.innerHTML = activeActions.map(a => {
            const isResolved = resolvedActions.has(a.id);
            const riskClass = a.risk.toLowerCase().replace(' ', '-');
            return `
                <div class="action-item ${isResolved ? 'resolved' : ''}">
                    <div class="action-header">
                        <div style="display:flex; align-items:center; gap:12px;">
                            <input type="checkbox" class="action-checkbox" data-id="${a.id}" ${isResolved ? 'checked' : ''}>
                            <span class="action-title" style="font-weight: 700;">${a.action}</span>
                        </div>
                        <span class="saving-tag">${isResolved ? '✓ Realized' : ''} Save $${a.monthly_saving_usd}/mo</span>
                    </div>
                    <div class="action-details" style="padding-left:32px;">
                        <span>📦 Env: <strong style="text-transform: capitalize;">${a.env}</strong> • Resource: <strong>${a.resource}</strong></span>
                        <span class="risk risk-${riskClass}">${a.risk}</span>
                    </div>
                    <div class="how-to" style="margin-left:32px;">💡 <strong>Remediation:</strong> ${a.how_to_do_it}</div>
                </div>
            `;
        }).join('');

        // Attach action toggle listeners
        actionsEl.querySelectorAll(".action-checkbox").forEach(box => {
            box.addEventListener("change", (e) => {
                const actionId = box.getAttribute("data-id");
                if (box.checked) {
                    resolvedActions.add(actionId);
                } else {
                    resolvedActions.delete(actionId);
                }
                updateDashboard(); // Redraw UI calculations
            });
        });
    } else {
        actionsEl.innerHTML = `
            <div class="empty-state">
                <span class="empty-icon">🏖️</span>
                <p>No immediate decommissioning actions in the <strong>${activeEnvironment}</strong> environment.</p>
            </div>
        `;
    }
    
    // 5. Render Database Resizing Recommendations
    const resizeEl = document.getElementById('resize-list');
    if (activeResizes.length > 0) {
        resizeEl.innerHTML = activeResizes.map(r => `
            <div class="resize-item">
                <strong>${r.resource}</strong>
                <div class="resize-arrow">
                    <span class="old-size">${r.current}</span>
                    <span style="color:#64748b">→</span>
                    <span class="new-size">${r.recommended}</span>
                    <span class="saving-tag">$${r.monthly_saving_usd}/mo saved</span>
                </div>
                <small>⚡ <strong>AI Recommendation:</strong> ${r.reason}</small>
            </div>
        `).join('');
    } else {
        resizeEl.innerHTML = `
            <div class="empty-state">
                <span class="empty-icon">💎</span>
                <p>No oversized databases detected in the <strong>${activeEnvironment}</strong> environment.</p>
            </div>
        `;
    }
    
    // 6. Render Anomalies list
    const anomalyEl = document.getElementById('anomalies-list');
    if (activeAnomalies.length > 0) {
        anomalyEl.innerHTML = activeAnomalies.map(a => `
            <div class="anomaly-item">
                <strong>${a.service}</strong>: ${a.anomaly}
                <span class="impact">⚠️ Impact: ${a.impact}</span>
            </div>
        `).join('');
    } else {
        anomalyEl.innerHTML = `
            <div class="empty-state">
                <span class="empty-icon">🔍</span>
                <p>No cost spikes identified in the <strong>${activeEnvironment}</strong> environment.</p>
            </div>
        `;
    }

    // 7. Update Visualization SVG elements
    renderDonutChart(netCurrentSpend, netSavingsLeft);
    renderSparklineTrend(netCurrentSpend, netPredictedSpend);
}

// Re-draw Donut Chart using active parameters
function renderDonutChart(totalSpend, savingsPotential) {
    const svg = document.getElementById("donut-chart");
    if (!svg) return;
    
    const optimized = totalSpend - savingsPotential;
    const r = 38;
    const cx = 50;
    const cy = 50;
    const circumference = 2 * Math.PI * r;
    
    const optimizedPct = totalSpend > 0 ? (optimized / totalSpend) * 100 : 100;
    const wastePct = totalSpend > 0 ? (savingsPotential / totalSpend) * 100 : 0;
    
    const strokeDash1 = (optimizedPct / 100) * circumference;
    const strokeDash2 = (wastePct / 100) * circumference;
    
    svg.innerHTML = `
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="transparent" stroke="rgba(255,255,255,0.02)" stroke-width="8"/>
        
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="transparent" 
                stroke="#10b981" stroke-width="8.5"
                stroke-dasharray="${strokeDash1} ${circumference}"
                stroke-linecap="round"
                filter="drop-shadow(0 0 4px rgba(16,185,129,0.2))"
                transform="rotate(-90 ${cx} ${cy})"/>
                
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="transparent" 
                stroke="#ef4444" stroke-width="8.5"
                stroke-dasharray="${strokeDash2} ${circumference}"
                stroke-dashoffset="-${strokeDash1}"
                stroke-linecap="round"
                filter="drop-shadow(0 0 5px rgba(239,68,68,0.3))"
                transform="rotate(-90 ${cx} ${cy})"/>
    `;
    
    document.getElementById("chart-center-val").textContent = `$${totalSpend.toFixed(0)}`;
    
    const legendList = document.getElementById("chart-legend-list");
    legendList.innerHTML = `
        <div class="legend-item">
            <div class="legend-info">
                <span class="legend-color" style="background:#10b981; box-shadow: 0 0 8px rgba(16,185,129,0.4)"></span>
                <span>Active Spend</span>
            </div>
            <span class="legend-cost">$${optimized.toFixed(2)}</span>
        </div>
        <div class="legend-item">
            <div class="legend-info">
                <span class="legend-color" style="background:#ef4444; box-shadow: 0 0 8px rgba(239,68,68,0.4)"></span>
                <span>Unmitigated Waste</span>
            </div>
            <span class="legend-cost" style="color:#ef4444">$${savingsPotential.toFixed(2)}</span>
        </div>
    `;
}

// Draw Runway Trend line
function renderSparklineTrend(currentSpend, optimizedSpend) {
    const svg = document.getElementById("trend-sparkline");
    if (!svg) return;
    
    const maxVal = currentSpend * 1.1;
    const mapY = (cost) => maxVal > 0 ? (50 - ((cost / maxVal) * 35)) : 25;
    
    const coords = [
        {x: 10, y: mapY(currentSpend)},
        {x: 70, y: mapY(currentSpend * 0.98)},
        {x: 140, y: mapY(currentSpend * 1.02)},
        {x: 210, y: mapY((currentSpend + optimizedSpend) / 2)},
        {x: 290, y: mapY(optimizedSpend)}
    ];
    
    let dPath = `M ${coords[0].x} ${coords[0].y}`;
    for (let i = 0; i < coords.length - 1; i++) {
        const xc = (coords[i].x + coords[i+1].x) / 2;
        const yc = (coords[i].y + coords[i+1].y) / 2;
        dPath += ` Q ${coords[i].x} ${coords[i].y}, ${xc} ${yc}`;
    }
    dPath += ` T ${coords[coords.length - 1].x} ${coords[coords.length - 1].y}`;
    
    const fillPath = `${dPath} L 290 60 L 10 60 Z`;
    
    svg.innerHTML = `
        <defs>
            <linearGradient id="sparkline-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#10b981" stop-opacity="0.2"/>
                <stop offset="100%" stop-color="#10b981" stop-opacity="0"/>
            </linearGradient>
            <linearGradient id="sparkline-line" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stop-color="#8b5cf6"/>
                <stop offset="50%" stop-color="#34d399"/>
                <stop offset="100%" stop-color="#10b981"/>
            </linearGradient>
        </defs>
        
        <path d="${fillPath}" fill="url(#sparkline-fill)"/>
        <path d="${dPath}" fill="none" stroke="url(#sparkline-line)" stroke-width="3" filter="drop-shadow(0 2px 4px rgba(16,185,129,0.15))"/>
        <circle cx="${coords[0].x}" cy="${coords[0].y}" r="4" fill="#8b5cf6" stroke="#080b11" stroke-width="2"/>
        <circle cx="${coords[coords.length - 1].x}" cy="${coords[coords.length - 1].y}" r="4.5" fill="#10b981" stroke="#080b11" stroke-width="2"/>
    `;
    
    const savingsDelta = currentSpend > 0 ? (((currentSpend - optimizedSpend) / currentSpend) * 100) : 0;
    document.getElementById("savings-delta").textContent = `-${savingsDelta.toFixed(1)}% Waste Reduced`;
}

// Download local JSON data
function exportJSONReport() {
    if (!currentReportData) return;
    
    // Add active context metrics to the export payload
    const exportPayload = {
        ...currentReportData,
        resolved_actions_count: resolvedActions.size,
        resolved_actions_ids: Array.from(resolvedActions),
        active_environment_view: activeEnvironment
    };

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportPayload, null, 4));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `cloud_cost_audit_${activeEnvironment}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
}

// Groq Cost CoPilot submit logic
function handleCopilotSubmit(presetQuery = null) {
    const inputEl = document.getElementById("copilot-input");
    const chatContainer = document.getElementById("copilot-chat-messages");
    if (!inputEl || !chatContainer) return;
    
    const query = (presetQuery || inputEl.value).trim();
    if (!query) return;
    
    // Clear user input
    if (!presetQuery) inputEl.value = "";
    
    // Append User Bubble
    const userBubble = document.createElement("div");
    userBubble.className = "chat-bubble user-message";
    userBubble.innerHTML = `<strong>You:</strong> ${escapeHTML(query)}`;
    chatContainer.appendChild(userBubble);
    scrollChatBottom();
    
    // Append Typing Indicator
    const typingIndicator = document.createElement("div");
    typingIndicator.className = "typing-indicator";
    typingIndicator.id = "copilot-typing";
    typingIndicator.innerHTML = `
        <span class="typing-dot"></span>
        <span class="typing-dot"></span>
        <span class="typing-dot"></span>
    `;
    chatContainer.appendChild(typingIndicator);
    scrollChatBottom();
    
    // Process query answer with Llama 3 mock engine
    setTimeout(() => {
        // Remove typing indicator
        const indicator = document.getElementById("copilot-typing");
        if (indicator) indicator.remove();
        
        const responseText = generateCopilotResponse(query);
        
        // Append Bot Bubble
        const botBubble = document.createElement("div");
        botBubble.className = "chat-bubble bot-message";
        botBubble.innerHTML = `<strong>CoPilot:</strong> ${responseText}`;
        chatContainer.appendChild(botBubble);
        scrollChatBottom();
    }, 1000);
}

// Scroll chat panel to bottom
function scrollChatBottom() {
    const chatContainer = document.getElementById("copilot-chat-messages");
    if (chatContainer) {
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }
}

// Escape HTML entities to prevent XSS in chat
function escapeHTML(str) {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Client-Side AI Response Engine based on loaded report context
function generateCopilotResponse(query) {
    const q = query.toLowerCase();
    
    if (q.includes("biggest") || q.includes("most money") || q.includes("waste") || q.includes("wasting")) {
        return `Looking at our current dataset, the single largest optimization source is the idle EC2 staging server: 
                <br><br>
                <strong>i-0a1b2c3d4 (m5.2xlarge)</strong> in ap-south-1. 
                <br>
                It is costing <strong>$280.00/month</strong> while sitting at a CPU utilization average of just <strong>0.8%</strong>. 
                Decommissioning this asset yields immediate savings without affecting production traffic.`;
    }
    
    if (q.includes("s3") || q.includes("storage") || q.includes("spike") || q.includes("anomaly")) {
        return `Yes, S3 storage triggered a billing anomaly this month. S3 costs jumped **+70%** (+$140.00). 
                <br><br>
                Our scan indicates this is caused by 890 GB of logs in the <code>company-logs-backup-2024</code> bucket that hasn't been accessed in over 200 days, and 340 GB of old build artifacts. 
                <br>
                <strong>Suggested Fix:</strong> Configure a lifecycle policy to automatically delete artifacts older than 30 days and transition cold backups to Glacier Deep Archive.`;
    }
    
    if (q.includes("database") || q.includes("mysql") || q.includes("rds") || q.includes("resize") || q.includes("downsize")) {
        return `Our audit identified that your primary database <strong>prod-mysql-01</strong> (currently running on a <code>db.r5.2xlarge</code> at <strong>$890.00/mo</strong>) is significantly over-allocated.
                <br><br>
                It only uses 45 GB out of 500 GB storage allocated, and averages just 12 concurrent connections (max limit: 1000). 
                <br>
                I recommend downsizing the instance type to a <strong>db.t3.medium</strong>. This will reduce database spend down to approximately $50/mo, saving you <strong>$840.00/mo</strong> with zero transaction lag.`;
    }
    
    if (q.includes("staging") || q.includes("save") || q.includes("runway")) {
        return `In the <strong>Staging</strong> environment, you can save a total of <strong>$280.00/month</strong> immediately by shutting down the idle staging server <code>i-0a1b2c3d4</code>. 
                <br><br>
                If you also optimize databases and build pipelines, your total yearly runway savings across all environments stands at <strong>$5,844.00</strong>.`;
    }
    
    // Default helpful general response
    return `I am scanning your active cloud invoice. Here is a quick billing review:
            <ul>
                <li><strong>Current Monthly Spend:</strong> $4,250.00</li>
                <li><strong>Identified Monthly Waste:</strong> $487.00 (11.4% waste)</li>
                <li><strong>Alert Severity:</strong> High</li>
            </ul>
            You can ask me questions like:
            <br>
            • <em>"Why did S3 spike this month?"</em>
            <br>
            • <em>"What is the recommended size for production MySQL?"</em>
            <br>
            • <em>"Which instance is wasting the most money?"</em>`;
}

// Expose simulation globally
window.runAgent = runAgentSimulation;
