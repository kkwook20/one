// Related files:
// - frontend/src/App.tsx
// - frontend/src/components/Argosa/function/*.tsx
// Location: frontend/src/components/Argosa/ArgosaSystem.tsx

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Button } from "../ui/button";
import { AlertCircle } from "lucide-react";

// Import all function components
import DataCollection from "./function/DataCollection";
import DataAnalysis from "./function/DataAnalysis";
import Prediction from "./function/Prediction";
import Scheduling from "./function/Scheduling";
import CodeAnalysis from "./function/CodeAnalysis";
import UserInput from "./function/UserInput";
import DBCenter from "./function/DBCenter";

const NAV_ITEMS = [
  { key: "collection", label: "Data Collection", component: DataCollection },
  { key: "analysis", label: "Data Analysis", component: DataAnalysis },
  { key: "prediction", label: "Prediction", component: Prediction },
  { key: "scheduling", label: "Scheduling", component: Scheduling },
  { key: "code", label: "Code Developer", component: CodeAnalysis },
  { key: "input", label: "User Input", component: UserInput },
  { key: "dbcenter", label: "DB Center", component: DBCenter },
];

export default function ArgosaSystem() {
  const [active, setActive] = useState("collection");
  const [hasSessionIssue, setHasSessionIssue] = useState(false);
  
  // Check for session issues
  useEffect(() => {
    const checkSessionIssues = () => {
      // Check localStorage for session issues
      const sessionIssue = localStorage.getItem('argosa_session_issue');
      const scheduleFailure = localStorage.getItem('argosa_schedule_failure');
      
      setHasSessionIssue(!!sessionIssue || !!scheduleFailure);
    };
    
    // Initial check
    checkSessionIssues();
    
    // Check periodically
    const interval = setInterval(checkSessionIssues, 5000);
    
    return () => clearInterval(interval);
  }, []);
  
  // Clear session issue when navigating to data collection
  useEffect(() => {
    if (active === "collection") {
      // Clear the issue flags after a short delay (to ensure user sees it)
      setTimeout(() => {
        localStorage.removeItem('argosa_session_issue');
        localStorage.removeItem('argosa_schedule_failure');
        setHasSessionIssue(false);
      }, 3000);
    }
  }, [active]);
  
  // Get the active component
  const ActiveComponent = NAV_ITEMS.find(item => item.key === active)?.component || DataCollection;
  
  return (
    <div className="h-full w-full bg-gray-50 flex text-gray-800">
      {/* Sidebar */}
      <aside className="w-56 border-r bg-white/80 backdrop-blur-xl p-4 flex-shrink-0">
        <nav className="flex flex-col gap-2">
          {NAV_ITEMS.map((item) => (
            <Button
              key={item.key}
              variant={active === item.key ? "secondary" : "ghost"}
              className={`justify-start text-left relative ${
                item.key === "collection" && hasSessionIssue && active !== "collection" 
                  ? "pr-8" 
                  : ""
              }`}
              onClick={() => setActive(item.key)}
            >
              {item.label}
              {item.key === "collection" && hasSessionIssue && active !== "collection" && (
                <AlertCircle className="h-4 w-4 text-red-500 absolute right-2 animate-pulse" />
              )}
            </Button>
          ))}
        </nav>
      </aside>
      
      {/* Main content */}
      <main className={`flex-1 ${active !== "collection" ? "p-8 overflow-y-auto" : "overflow-hidden"}`}>
        <motion.div
          key={active}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="h-full"
        >
          <ActiveComponent />
        </motion.div>
      </main>
    </div>
  );
}