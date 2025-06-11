// Related files:
// - frontend/src/App.tsx
// - frontend/src/components/Argosa/function/*.tsx
// Location: frontend/src/components/Argosa/ArgosaSystem.tsx

import { useState } from "react";
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
  
  return (
    <div className="min-h-screen w-full bg-gray-50 flex text-gray-800">
      {/* Sidebar */}
      <aside className="w-56 border-r bg-white/80 backdrop-blur-xl p-4">
        <nav className="flex flex-col gap-2">
          {NAV_ITEMS.map((item) => (
            <Button
              key={item.key}
              variant={active === item.key ? "secondary" : "ghost"}
              className="justify-start text-left"
              onClick={() => setActive(item.key)}
            >
              {item.label}
            </Button>
          ))}
        </nav>
      </aside>
      
      {/* Main content */}
      <main className="flex-1 p-8 overflow-y-auto">
        {active === "collection" && <CollectionPanel />}
        {active === "analysis" && <AnalysisPanel />}
        {active === "prediction" && <PredictionPanel />}
        {active === "scheduling" && <SchedulingPanel />}
        {active === "code" && <CodePanel />}
        {active === "input" && <InputPanel />}
      </main>
    </div>
  );
}

/* ------------------------------ Panels ------------------------------ */

function CollectionPanel() {
  return (
    <Section title="Information Collection">
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <StatusCard
          title="Web Crawling"
          value="12 Active"
          description="Running crawlers"
        />
        <StatusCard
          title="Data Points"
          value="1.2M"
          description="Collected today"
        />
        <StatusCard
          title="Sources"
          value="48"
          description="Connected sources"
        />
      </div>
      <div className="flex justify-end">
        <Button onClick={() => window.location.href = '/argosa/function/data-collection'}>
          View Details →
        </Button>
      </div>
    </Section>
  );
}

function AnalysisPanel() {
  return (
    <Section title="AI-Powered Data Analysis">
      <Tabs defaultValue="patterns" className="w-full">
        <TabsList>
          <TabsTrigger value="patterns">Pattern Recognition</TabsTrigger>
          <TabsTrigger value="trends">Trend Analysis</TabsTrigger>
          <TabsTrigger value="insights">Insights</TabsTrigger>
        </TabsList>
        <TabsContent value="patterns">
          <Placeholder text="AI-detected patterns and anomalies visualization." />
        </TabsContent>
        <TabsContent value="trends">
          <Placeholder text="Time-series trends and historical data analysis." />
        </TabsContent>
        <TabsContent value="insights">
          <Placeholder text="AI-generated insights and recommendations." />
        </TabsContent>
      </Tabs>
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



interface StatusCardProps {
  title: string;
  value: string;
  description: string;
}

function StatusCard({ title, value, description }: StatusCardProps) {
  return (
    <Card className="hover:shadow-lg transition-shadow">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <p className="text-sm text-gray-600 mt-1">{description}</p>
      </CardContent>
    </Card>
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