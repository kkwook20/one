// Related files:
// - frontend/src/App.tsx
// - frontend/src/components/Argosa/function/*.tsx
// Location: frontend/src/components/Argosa/ArgosaSystem.tsx

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../ui/card";
import { Button } from "../ui/button";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../ui/tabs";
import { AlertCircle } from "lucide-react";
import DataCollection from "./function/DataCollection";

const NAV_ITEMS = [
  { key: "collection", label: "Data Collection" },
  { key: "analysis", label: "Data Analysis" },
  { key: "prediction", label: "Prediction Model" },
  { key: "scheduling", label: "Scheduling" },
  { key: "code", label: "Code Analysis" },
  { key: "input", label: "User Input" },
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
        {active === "collection" && <DataCollection />}
        {active === "analysis" && <DataAnalysisPanel />}
        {active === "prediction" && <PredictionPanel />}
        {active === "scheduling" && <SchedulingPanel />}
        {active === "code" && <CodePanel />}
        {active === "input" && <InputPanel />}
      </main>
    </div>
  );
}

/* ------------------------------ Panels ------------------------------ */

function DataAnalysisPanel() {
  return (
    <Section title="Data Analysis & Insights">
      <div className="grid md:grid-cols-2 gap-4">
        <Card className="h-48 flex items-center justify-center">
          <span className="text-gray-400 italic">Conversation analytics and insights coming soon...</span>
        </Card>
        <Card className="h-48 flex items-center justify-center">
          <span className="text-gray-400 italic">Pattern recognition and trend analysis...</span>
        </Card>
        <Card className="h-48 flex items-center justify-center">
          <span className="text-gray-400 italic">Topic clustering and categorization...</span>
        </Card>
        <Card className="h-48 flex items-center justify-center">
          <span className="text-gray-400 italic">Usage statistics and reports...</span>
        </Card>
      </div>
    </Section>
  );
}

function PredictionPanel() {
  return (
    <Section title="Predictive Modeling">
      <div className="grid md:grid-cols-2 gap-4">
        <Placeholder text="Time-series forecasting with ARIMA/LSTM models." />
        <Placeholder text="Probability modeling and scenario analysis." />
      </div>
    </Section>
  );
}

function SchedulingPanel() {
  return (
    <Section title="Intelligent Scheduling">
      <div className="grid md:grid-cols-3 gap-4">
        <Placeholder text="AI-optimized task scheduling." />
        <Placeholder text="Priority management system." />
        <Placeholder text="Resource allocation dashboard." />
      </div>
    </Section>
  );
}

function CodePanel() {
  return (
    <Section title="Code Analysis & Optimization">
      <Tabs defaultValue="review" className="w-full">
        <TabsList>
          <TabsTrigger value="review">Code Review</TabsTrigger>
          <TabsTrigger value="security">Security Scan</TabsTrigger>
          <TabsTrigger value="optimize">Auto Optimization</TabsTrigger>
        </TabsList>
        <TabsContent value="review">
          <Placeholder text="AI-powered code quality assessment." />
        </TabsContent>
        <TabsContent value="security">
          <Placeholder text="Vulnerability detection and security analysis." />
        </TabsContent>
        <TabsContent value="optimize">
          <Placeholder text="Performance optimization suggestions." />
        </TabsContent>
      </Tabs>
    </Section>
  );
}

function InputPanel() {
  return (
    <Section title="User Feedback & Learning Data">
      <div className="grid md:grid-cols-2 gap-4">
        <Placeholder text="Feedback collection and sentiment analysis." />
        <Placeholder text="Training data management and model improvement." />
      </div>
    </Section>
  );
}

/* --------------------------- Reusable UI --------------------------- */

interface SectionProps {
  title: string;
  children: React.ReactNode;
}

function Section({ title, children }: SectionProps) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-6"
    >
      <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
      {children}
    </motion.section>
  );
}

interface PlaceholderProps {
  text: string;
}

function Placeholder({ text }: PlaceholderProps) {
  return (
    <Card className="h-48 flex items-center justify-center">
      <span className="text-gray-400 italic">{text}</span>
    </Card>
  );
}