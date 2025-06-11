// Related files:
// - frontend/src/components/Argosa/function/*.tsx
// Location: frontend/src/components/Argosa/function/DataCollection.tsx

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../ui/card";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Textarea } from "../../ui/textarea";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../../ui/tabs";
import { Badge } from "../../ui/badge";
import { Progress } from "../../ui/progress";
import { 
  ArrowLeft, 
  Globe, 
  Upload, 
  Database, 
  Play, 
  Pause, 
  RefreshCw,
  Settings,
  Download,
  AlertCircle
} from "lucide-react";

export default function DataCollection() {
  const [activeTab, setActiveTab] = useState("web");
  const [isRunning, setIsRunning] = useState(false);

  return (
    <div className="min-h-screen w-full bg-gray-50 text-gray-800">
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-xl">
        <div className="flex items-center justify-between p-6">
          <div className="flex items-center gap-4">
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => window.location.href = '/argosa'}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Dashboard
            </Button>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Data Collection</h1>
              <p className="text-sm text-gray-600">Manage and monitor data sources</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={isRunning ? "default" : "secondary"}>
              {isRunning ? "Running" : "Paused"}
            </Badge>
            <Button
              variant={isRunning ? "destructive" : "default"}
              size="sm"
              onClick={() => setIsRunning(!isRunning)}
            >
              {isRunning ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="p-6">
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Left Panel - Sources */}
          <div className="lg:col-span-2 space-y-6">
            <Section title="Data Sources">
              <Tabs defaultValue="web" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="web">
                    <Globe className="h-4 w-4 mr-2" />
                    Web Crawler
                  </TabsTrigger>
                  <TabsTrigger value="file">
                    <Upload className="h-4 w-4 mr-2" />
                    File Upload
                  </TabsTrigger>
                  <TabsTrigger value="api">
                    <Database className="h-4 w-4 mr-2" />
                    API/Database
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="web" className="space-y-4">
                  <Card>
                    <CardHeader>
                      <CardTitle>Web Crawler Configuration</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <label className="text-sm font-medium">Target URL</label>
                        <Input 
                          placeholder="https://example.com" 
                          className="mt-1"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-sm font-medium">Crawl Depth</label>
                          <Input type="number" defaultValue="3" className="mt-1" />
                        </div>
                        <div>
                          <label className="text-sm font-medium">Interval (min)</label>
                          <Input type="number" defaultValue="60" className="mt-1" />
                        </div>
                      </div>
                      <div>
                        <label className="text-sm font-medium">CSS Selectors</label>
                        <Textarea 
                          placeholder=".article-content, #main-text" 
                          className="mt-1"
                          rows={3}
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button className="flex-1">Add Crawler</Button>
                        <Button variant="outline">
                          <Settings className="h-4 w-4 mr-2" />
                          Advanced
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Active Crawlers */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Active Crawlers</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        <CrawlerItem 
                          url="https://techcrunch.com"
                          status="running"
                          lastRun="2 min ago"
                          dataPoints="1,234"
                        />
                        <CrawlerItem 
                          url="https://news.ycombinator.com"
                          status="scheduled"
                          lastRun="1 hour ago"
                          dataPoints="856"
                        />
                        <CrawlerItem 
                          url="https://reddit.com/r/technology"
                          status="error"
                          lastRun="3 hours ago"
                          dataPoints="2,045"
                        />
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="file" className="space-y-4">
                  <Card>
                    <CardHeader>
                      <CardTitle>File Upload</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                        <Upload className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                        <p className="text-sm text-gray-600 mb-2">
                          Drag and drop files here, or click to browse
                        </p>
                        <p className="text-xs text-gray-500 mb-4">
                          Supports CSV, JSON, XML, TXT (Max 100MB)
                        </p>
                        <Button variant="outline">Browse Files</Button>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="api" className="space-y-4">
                  <Card>
                    <CardHeader>
                      <CardTitle>API Connection</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <label className="text-sm font-medium">Endpoint URL</label>
                        <Input 
                          placeholder="https://api.example.com/data" 
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium">Authentication</label>
                        <select className="w-full mt-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm">
                          <option>None</option>
                          <option>API Key</option>
                          <option>OAuth 2.0</option>
                          <option>Basic Auth</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-sm font-medium">Headers</label>
                        <Textarea 
                          placeholder='{"Authorization": "Bearer token"}' 
                          className="mt-1 font-mono text-sm"
                          rows={3}
                        />
                      </div>
                      <Button className="w-full">Test Connection</Button>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </Section>
          </div>

          {/* Right Panel - Stats & Monitoring */}
          <div className="space-y-6">
            <Section title="Real-time Statistics">
              <div className="space-y-4">
                <StatCard
                  title="Total Data Points"
                  value="2.4M"
                  change="+12.5%"
                  trend="up"
                />
                <StatCard
                  title="Active Sources"
                  value="24"
                  change="+3"
                  trend="up"
                />
                <StatCard
                  title="Error Rate"
                  value="0.3%"
                  change="-0.1%"
                  trend="down"
                />
                <StatCard
                  title="Avg. Response Time"
                  value="245ms"
                  change="-15ms"
                  trend="down"
                />
              </div>
            </Section>

            <Section title="Recent Activity">
              <Card>
                <CardContent className="p-4">
                  <div className="space-y-3">
                    <ActivityItem
                      time="2 min ago"
                      action="Data collected"
                      source="TechCrunch"
                      count="45 items"
                    />
                    <ActivityItem
                      time="5 min ago"
                      action="Crawl completed"
                      source="Reddit API"
                      count="128 items"
                    />
                    <ActivityItem
                      time="12 min ago"
                      action="File uploaded"
                      source="sales_data.csv"
                      count="1,024 rows"
                    />
                    <ActivityItem
                      time="1 hour ago"
                      action="Error occurred"
                      source="News API"
                      count="Rate limit"
                      type="error"
                    />
                  </div>
                </CardContent>
              </Card>
            </Section>

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1">
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
              <Button variant="outline" className="flex-1">
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

/* --------------------------- Components --------------------------- */

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
      className="space-y-4"
    >
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      {children}
    </motion.section>
  );
}

interface CrawlerItemProps {
  url: string;
  status: "running" | "scheduled" | "error";
  lastRun: string;
  dataPoints: string;
}

function CrawlerItem({ url, status, lastRun, dataPoints }: CrawlerItemProps) {
  const statusConfig = {
    running: { color: "text-green-600", bg: "bg-green-100", label: "Running" },
    scheduled: { color: "text-blue-600", bg: "bg-blue-100", label: "Scheduled" },
    error: { color: "text-red-600", bg: "bg-red-100", label: "Error" }
  };

  const config = statusConfig[status];

  return (
    <div className="flex items-center justify-between p-3 border rounded-lg">
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <Globe className="h-4 w-4 text-gray-400" />
          <span className="text-sm font-medium">{url}</span>
          <Badge className={`${config.bg} ${config.color} text-xs`}>
            {config.label}
          </Badge>
        </div>
        <div className="flex gap-4 mt-1">
          <span className="text-xs text-gray-500">Last run: {lastRun}</span>
          <span className="text-xs text-gray-500">Data: {dataPoints}</span>
        </div>
      </div>
      <div className="flex gap-1">
        <Button variant="ghost" size="sm">
          <RefreshCw className="h-3 w-3" />
        </Button>
        <Button variant="ghost" size="sm">
          <Settings className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

interface StatCardProps {
  title: string;
  value: string;
  change: string;
  trend: "up" | "down";
}

function StatCard({ title, value, change, trend }: StatCardProps) {
  const isPositive = trend === "up";
  
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-sm text-gray-600">{title}</p>
        <div className="flex items-baseline justify-between mt-1">
          <span className="text-2xl font-bold">{value}</span>
          <span className={`text-sm ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
            {change}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

interface ActivityItemProps {
  time: string;
  action: string;
  source: string;
  count: string;
  type?: "normal" | "error";
}

function ActivityItem({ time, action, source, count, type = "normal" }: ActivityItemProps) {
  return (
    <div className="flex items-start gap-3 text-sm">
      <span className="text-xs text-gray-500 w-16 flex-shrink-0">{time}</span>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className={type === "error" ? "text-red-600" : "text-gray-800"}>
            {action}
          </span>
          {type === "error" && <AlertCircle className="h-3 w-3 text-red-600" />}
        </div>
        <div className="text-xs text-gray-500">
          {source} • {count}
        </div>
      </div>
    </div>
  );
}